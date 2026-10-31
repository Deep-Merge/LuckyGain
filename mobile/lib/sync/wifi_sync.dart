import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../db/ledger_store.dart';
import 'phone_sync.dart';
import 'sync_protocol.dart';

const wifiSyncPort = 38471;

class WifiPhoneLink implements GoodsSyncPeer {
  WifiPhoneLink(this.store);

  final LedgerStore store;
  var inbox = MessageInbox();
  var mtu = 23;
  var connected = false;
  WebSocket? _socket;
  Completer<void>? _ready;
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
      onReport?.call(outcome);
    } catch (error) {
      onError?.call(wifiFailure(error));
    } finally {
      _busy = false;
      _arming = false;
      _heard = false;
      _running = null;
      inbox.clear();
      onChange?.call();
    }
  }

  Future<void> open(String host, String code) async {
    await close();
    inbox = MessageInbox();
    _heard = false;
    final socket = await WebSocket.connect(
      'ws://$host:$wifiSyncPort/sync?role=phone&code=$code',
    );
    final ready = Completer<void>();
    _ready = ready;
    _socket = socket;
    connected = false;
    socket.listen(
      (data) {
        final text = data is String ? data : utf8.decode(data as List<int>);
        _onText(text);
      },
      onDone: () {
        connected = false;
        if (_ready != null && !_ready!.isCompleted) {
          _ready!.completeError(
            const FormatException('The computer disconnected.'),
          );
        }
        inbox.fail(const FormatException('The computer disconnected.'));
        onChange?.call();
      },
      onError: (Object error) {
        connected = false;
        if (_ready != null && !_ready!.isCompleted) {
          _ready!.completeError(error);
        }
        inbox.fail(error);
        onChange?.call();
      },
    );
    await ready.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () {
        throw const FormatException(
          'Open Settings on the computer, then tap Connect again.',
        );
      },
    );
  }

  Future<void> close() async {
    connected = false;
    final socket = _socket;
    _socket = null;
    await socket?.close();
  }

  @override
  Future<void> send(Map<String, dynamic> message) async {
    final socket = _socket;
    if (socket == null) {
      throw const FormatException('The computer disconnected.');
    }
    socket.add(jsonEncode({'k': 'sync', 'm': message}));
  }

  Future<void> sendOpen(String url) async {
    final socket = _socket;
    if (socket == null || !connected) {
      throw const FormatException(
        'Open LuckyGain on the computer first. Stay on the same Wi-Fi.',
      );
    }
    socket.add(jsonEncode({'k': 'open', 'url': url}));
  }

  Future<void> dispose() async {
    await close();
  }

  void _onText(String text) {
    final frame = jsonDecode(text);
    if (frame is! Map) return;
    final kind = frame['k'];
    if (kind == 'reject') {
      inbox.fail(FormatException('${frame['message']}'));
      unawaited(close());
      return;
    }
    if (kind == 'peer') {
      final next = frame['connected'] == true;
      final waiting = _ready != null && !_ready!.isCompleted;
      if (next) {
        connected = true;
        if (waiting) _ready!.complete();
        onChange?.call();
        return;
      }
      final message = connected
          ? 'The computer disconnected.'
          : 'Open Settings on the computer, then tap Connect again.';
      connected = false;
      if (waiting) {
        _ready!.completeError(FormatException(message));
      } else {
        inbox.fail(FormatException(message));
        onError?.call(message);
      }
      unawaited(close());
      onChange?.call();
      return;
    }
    if (kind != 'sync' || frame['m'] is! Map) return;
    final incoming = Map<String, dynamic>.from(frame['m'] as Map);
    _heard = incoming['t'] == 'hello' ? true : _heard;
    inbox.push(incoming);
    if (incoming['t'] == 'hello' && !_busy && !_arming) {
      unawaited(begin(lead: false));
    }
  }
}

String? wifiHost(String raw) {
  var text = raw.trim();
  if (text.isEmpty) return null;
  text = text.replaceFirst(RegExp(r'^https?://'), '');
  text = text.split('/').first.trim();
  final colon = text.lastIndexOf(':');
  if (colon > 0) text = text.substring(0, colon);
  if (text.isEmpty || text.contains(' ')) return null;
  return text;
}

String? wifiCode(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length != 4) return null;
  return digits;
}

class WifiRemembered {
  const WifiRemembered({this.host = '', this.code = ''});

  final String host;
  final String code;
}

Future<WifiRemembered> loadWifiSync() async {
  try {
    final file = await _hostFile();
    if (!file.existsSync()) return const WifiRemembered();
    final lines = file.readAsStringSync().split('\n');
    final host = lines.isEmpty ? '' : lines.first.trim();
    final code = lines.length > 1 ? lines[1].replaceAll(RegExp(r'\D'), '') : '';
    return WifiRemembered(host: host, code: code);
  } catch (_) {
    return const WifiRemembered();
  }
}

Future<void> saveWifiSync(String host, String code) async {
  final file = await _hostFile();
  final cleanHost = host.trim();
  final cleanCode = code.replaceAll(RegExp(r'\D'), '');
  await file.writeAsString('$cleanHost\n$cleanCode');
}

Future<File> _hostFile() async {
  final dir = await getApplicationDocumentsDirectory();
  return File(p.join(dir.path, 'wifi-sync-host.txt'));
}

String wifiFailure(Object error) {
  if (error is FormatException) return error.message;
  if (error is SocketException) {
    return 'Could not reach that computer. Check the address, and that both are on the same Wi-Fi.';
  }
  if (error is WebSocketException) {
    final text = error.message.toLowerCase();
    if (text.contains('401') || text.contains('code')) {
      return 'That code does not match.';
    }
    return 'Could not reach that computer. Check the address, and that both are on the same Wi-Fi.';
  }
  return 'Could not sync goods.';
}
