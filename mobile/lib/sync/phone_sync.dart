import 'dart:async';

import 'package:flutter/services.dart';

import '../db/ledger_store.dart';
import 'goods_merge.dart';
import 'sync_protocol.dart';

class SyncProgress {
  const SyncProgress({
    required this.phase,
    required this.title,
    required this.detail,
    required this.value,
  });

  final String phase;
  final String title;
  final String detail;
  final double value;
}

abstract class GoodsSyncPeer {
  MessageInbox get inbox;
  int get mtu;
  Future<void> send(Map<String, dynamic> message);
}

class PhoneSyncLink implements GoodsSyncPeer {
  PhoneSyncLink(this.store);

  final LedgerStore store;
  final _channel = const MethodChannel('luckygain/sync');
  final _events = const EventChannel('luckygain/sync-events');
  final _decoder = FrameDecoder();
  StreamSubscription<dynamic>? _subscription;
  var inbox = MessageInbox();
  var mtu = 23;
  var connected = false;
  var _open = false;
  var _busy = false;
  var _arming = false;
  var _heard = false;
  Future<void>? _running;
  void Function(SyncProgress progress)? onProgress;
  void Function()? onChange;
  void Function(String text)? onStatus;
  void Function(SyncOutcome report)? onReport;
  void Function(String message)? onError;

  Future<void> begin({bool lead = true}) {
    if (_busy || _arming) return _running ?? Future.value();
    final run = _arm(lead);
    _running = run;
    return run;
  }

  Future<void> _arm(bool lead) async {
    if (lead) {
      _arming = true;
      try {
        await Future<void>.delayed(const Duration(milliseconds: 320));
        if (_heard) lead = false;
      } finally {
        _arming = false;
      }
    }
    if (_busy) return;
    _busy = true;
    try {
      final outcome = await runPhoneSync(
        link: this,
        store: store,
        lead: lead,
        onProgress: (progress) => onProgress?.call(progress),
      );
      if (onReport != null) {
        onReport!.call(outcome);
      } else {
        onStatus?.call(
          'Sync finished. This phone updated ${outcome.took.updated} and added ${outcome.took.inserted}. The computer updated ${outcome.peer.updated} and added ${outcome.peer.inserted}.',
        );
      }
    } catch (error) {
      onError?.call(_syncError(error));
    } finally {
      _busy = false;
      _running = null;
      onChange?.call();
    }
  }

  Future<void> open() async {
    if (_open) return;
    inbox = MessageInbox();
    _heard = false;
    final allowed = await _channel.invokeMethod<bool>('prepare');
    if (allowed != true) {
      throw const FormatException(
        'Allow Bluetooth for LuckyGain, then tap Connect again.',
      );
    }
    _subscription ??= _events.receiveBroadcastStream().listen(_onEvent);
    await _channel.invokeMethod<void>('start');
    _open = true;
  }

  Future<void> close() async {
    _open = false;
    connected = false;
    await _channel.invokeMethod<void>('stop');
  }

  Future<void> send(Map<String, dynamic> message) {
    return _channel.invokeMethod<void>('write', {
      'bytes': encodeMessage(message),
    });
  }

  void _onEvent(dynamic event) {
    if (event is! Map) return;
    final type = event['type'];
    if (type == 'connected') connected = true;
    if (type == 'disconnected') {
      connected = false;
      inbox.fail(const FormatException('The computer disconnected.'));
    }
    if (type == 'mtu') {
      final next = event['mtu'];
      if (next is int && next > mtu) mtu = next;
    }
    if (type == 'rx' && event['bytes'] is Uint8List) {
      _heard = true;
      try {
        for (final message in _decoder.push(event['bytes'] as Uint8List)) {
          inbox.push(message);
        }
        if (!_busy && !_arming) unawaited(begin(lead: false));
      } catch (error) {
        inbox.fail(error);
      }
    }
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }
}

class SyncOutcome {
  const SyncOutcome({required this.took, required this.peer});

  final SyncCounts took;
  final SyncCounts peer;
}

List<SyncChange> _changesOf(Object? raw) {
  if (raw is! List) return const [];
  final changes = <SyncChange>[];
  for (final item in raw) {
    if (item is! Map) continue;
    final action = '${item['action'] ?? ''}';
    if (action != 'added' && action != 'updated') continue;
    final title = '${item['title'] ?? ''}'.trim();
    changes.add(
      SyncChange(title: title.isEmpty ? 'Untitled' : title, action: action),
    );
  }
  return changes;
}

String _syncError(Object error) {
  if (error is FormatException) return error.message;
  if (error is PlatformException && (error.message ?? '').isNotEmpty) {
    return error.message!;
  }
  return 'Could not sync goods.';
}

Future<SyncOutcome> runPhoneSync({
  required GoodsSyncPeer link,
  required LedgerStore store,
  required bool lead,
  required void Function(SyncProgress progress) onProgress,
}) async {
  final db = store.database;
  _report(
    onProgress,
    'compare',
    'Comparing goods',
    'Looking for newer copies',
    0.08,
  );
  final hello = await _exchange(link, lead, {
    't': 'hello',
    'v': syncVersion,
    'name': 'phone',
    'mtu': link.mtu,
  }, 'hello');
  if (hello['v'] != syncVersion) {
    throw const FormatException('The computer is using a different sync version');
  }

  _report(onProgress, 'compare', 'Comparing goods', 'Checking both lists', 0.2);
  final catalog = await _exchange(link, lead, {
    't': 'catalog',
    'goods': syncCatalog(db),
  }, 'catalog');
  final remote = [
    for (final item in (catalog['goods'] as List? ?? const []))
      Map<String, dynamic>.from(item as Map),
  ];
  final wanted = _idsNeeded(syncCatalog(db), remote);
  final need = await _exchange(link, lead, {
    't': 'need',
    'ids': wanted,
  }, 'need');
  final asked = [
    for (final id in (need['ids'] as List? ?? const [])) '$id',
  ];
  final outgoing = syncRecords(db, asked);
  final incoming = lead
      ? await _sendThenReceive(link, onProgress, outgoing, wanted.length)
      : await _receiveThenSend(link, onProgress, outgoing, wanted.length);

  _report(onProgress, 'save', 'Saving', 'Writing the newer goods', 0.92);
  final took = applyIncomingGoods(db, incoming);
  store.refresh();
  final applied = await _exchange(link, lead, {
    't': 'applied',
    'inserted': took.inserted,
    'updated': took.updated,
    'unchanged': took.unchanged,
    'changes': [
      for (final change in took.changes)
        {'title': change.title, 'action': change.action},
    ],
  }, 'applied');
  _report(onProgress, 'save', 'Saving', 'Finished', 1);
  return SyncOutcome(
    took: took,
    peer: SyncCounts(
      inserted: (applied['inserted'] as num?)?.toInt() ?? 0,
      updated: (applied['updated'] as num?)?.toInt() ?? 0,
      unchanged: (applied['unchanged'] as num?)?.toInt() ?? 0,
      changes: _changesOf(applied['changes']),
    ),
  );
}

Future<Map<String, dynamic>> _exchange(
  GoodsSyncPeer link,
  bool lead,
  Map<String, dynamic> mine,
  String type,
) async {
  if (lead) {
    await link.send(mine);
    return _expect(link, type);
  }
  final theirs = await _expect(link, type);
  await link.send(mine);
  return theirs;
}

Future<List<Map<String, dynamic>>> _sendThenReceive(
  GoodsSyncPeer link,
  void Function(SyncProgress progress) onProgress,
  List<Map<String, dynamic>> outgoing,
  int expected,
) async {
  await _sendRecords(link, onProgress, outgoing, 0.28, 0.56);
  return _readRecords(link, onProgress, expected, 0.58, 0.86);
}

Future<List<Map<String, dynamic>>> _receiveThenSend(
  GoodsSyncPeer link,
  void Function(SyncProgress progress) onProgress,
  List<Map<String, dynamic>> outgoing,
  int expected,
) async {
  final incoming = await _readRecords(link, onProgress, expected, 0.28, 0.56);
  await _sendRecords(link, onProgress, outgoing, 0.58, 0.86);
  return incoming;
}

Future<void> _sendRecords(
  GoodsSyncPeer link,
  void Function(SyncProgress progress) onProgress,
  List<Map<String, dynamic>> outgoing,
  double start,
  double end,
) async {
  if (outgoing.isEmpty) {
    _report(onProgress, 'send', 'Sending goods', 'Nothing new from here', end);
  }
  for (var index = 0; index < outgoing.length; index += 1) {
    _report(
      onProgress,
      'send',
      'Sending goods',
      '${index + 1} of ${outgoing.length}',
      start + ((end - start) * (index + 1)) / outgoing.length,
    );
    await link.send({'t': 'record', ...outgoing[index]});
  }
  await link.send({'t': 'batch'});
}

Future<List<Map<String, dynamic>>> _readRecords(
  GoodsSyncPeer link,
  void Function(SyncProgress progress) onProgress,
  int expected,
  double start,
  double end,
) async {
  final incoming = <Map<String, dynamic>>[];
  if (expected == 0) {
    _report(
      onProgress,
      'receive',
      'Receiving goods',
      'Nothing new from the other side',
      start,
    );
  }
  while (true) {
    final message = await link.inbox.next();
    if (message['t'] == 'batch') break;
    if (message['t'] == 'error') {
      throw FormatException('${message['message']}');
    }
    if (message['t'] != 'record') {
      throw const FormatException('Sync got out of step');
    }
    incoming.add(message);
    final total = expected > incoming.length ? expected : incoming.length;
    _report(
      onProgress,
      'receive',
      'Receiving goods',
      '${incoming.length} of $total',
      start + ((end - start) * incoming.length) / total,
    );
  }
  return incoming;
}

void _report(
  void Function(SyncProgress progress) onProgress,
  String phase,
  String title,
  String detail,
  double value,
) {
  onProgress(
    SyncProgress(phase: phase, title: title, detail: detail, value: value),
  );
}

Future<Map<String, dynamic>> _expect(GoodsSyncPeer link, String type) async {
  final message = await link.inbox.next();
  if (message['t'] == 'error') {
    throw FormatException('${message['message']}');
  }
  if (message['t'] != type) {
    throw const FormatException('Sync got out of step');
  }
  return message;
}

List<String> _idsNeeded(
  List<Map<String, dynamic>> local,
  List<Map<String, dynamic>> remote,
) {
  final mine = {for (final item in local) '${item['id']}': item};
  final twins = <String, Map<String, dynamic>>{};
  for (final item in local) {
    final key = _identity(item);
    if (key.isEmpty || twins.containsKey(key)) continue;
    twins[key] = item;
  }
  final ids = <String>[];
  for (final item in remote) {
    final id = '${item['id']}';
    final current = mine[id] ?? twins[_identity(item)];
    if (current == null) {
      if (item['deleted'] != true) ids.add(id);
      continue;
    }
    if ('${item['updatedAt']}'.compareTo('${current['updatedAt']}') > 0) {
      ids.add(id);
    }
  }
  return ids;
}

String _identity(Map<String, dynamic> item) {
  final title = '${item['title'] ?? ''}'.trim().toLowerCase();
  final purchasedOn = '${item['purchasedOn'] ?? ''}'.trim();
  if (title.isEmpty || purchasedOn.isEmpty) return '';
  return [
    title,
    purchasedOn,
    '${item['priceCents'] ?? ''}',
    '${item['forWhom'] ?? ''}'.trim().toLowerCase(),
  ].join('\t');
}
