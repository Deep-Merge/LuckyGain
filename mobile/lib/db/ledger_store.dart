import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';

class GoodRow {
  const GoodRow({
    this.id = '',
    required this.title,
    required this.priceCents,
    required this.purchasedOn,
    required this.whom,
    this.category = 'other',
    this.url,
    this.notes,
    this.imageDataUrl,
    this.returnedOn,
    this.enabled = true,
    this.comment,
    this.calledPriceCents,
  });

  final String id;
  final String title;
  final int priceCents;
  final String purchasedOn;
  final String whom;
  final String category;
  final String? url;
  final String? notes;
  final String? imageDataUrl;
  final String? returnedOn;
  final bool enabled;
  final String? comment;
  final int? calledPriceCents;

  bool get outsideWallet =>
      whom == 'self' || (notes ?? '').contains('[outside-wallet]');
}

class ProjectRow {
  const ProjectRow({
    required this.name,
    required this.clientName,
    required this.projectType,
    required this.releasedNetCents,
  });

  final String name;
  final String clientName;
  final String projectType;
  final int releasedNetCents;
}

class ClientRollup {
  const ClientRollup({
    required this.name,
    required this.releasedNetCents,
    required this.projectCount,
  });

  final String name;
  final int releasedNetCents;
  final int projectCount;
}

class LedgerSnapshot {
  const LedgerSnapshot({
    required this.ready,
    this.greetingName,
    this.goodsCount = 0,
    this.projectCount = 0,
    this.releasedNetCents = 0,
    this.goods = const [],
    this.projects = const [],
    this.clients = const [],
  });

  final bool ready;
  final String? greetingName;
  final int goodsCount;
  final int projectCount;
  final int releasedNetCents;
  final List<GoodRow> goods;
  final List<ProjectRow> projects;
  final List<ClientRollup> clients;

  bool get hasActivity => goodsCount > 0 || projectCount > 0;
}

class LedgerStore {
  Database? _db;
  String? _path;
  LedgerSnapshot snapshot = const LedgerSnapshot(ready: false);
  String? notice;
  String? error;

  Future<void> open() async {
    final dir = await getApplicationDocumentsDirectory();
    _path = p.join(dir.path, 'luckygain.sqlite');
    final file = File(_path!);
    final fresh = !file.existsSync() || file.lengthSync() == 0;
    _db = sqlite3.open(_path!);
    _db!.execute('PRAGMA foreign_keys = ON;');
    if (fresh ||
        !_hasTable('accounts') ||
        !_hasTable('milestones') ||
        !_hasTable('goods')) {
      final schema = await rootBundle.loadString('assets/db/schema.sql');
      _execScript(_db!, schema);
    }
    refresh();
  }

  Future<void> restore(Uint8List bytes) async {
    if (bytes.length < 16) {
      throw const FormatException('Backup file is empty');
    }
    final header = String.fromCharCodes(bytes.sublist(0, 15));
    if (header != 'SQLite format 3') {
      throw const FormatException('Not a valid SQLite backup');
    }

    final dir = await getApplicationDocumentsDirectory();
    final probePath = p.join(dir.path, 'luckygain.restore-probe.sqlite');
    final probeFile = File(probePath);
    await probeFile.writeAsBytes(bytes, flush: true);
    final probe = sqlite3.open(probePath);
    try {
      final hit = probe.select(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts' LIMIT 1",
      );
      if (hit.isEmpty) {
        throw const FormatException('Backup is missing LuckyGain tables');
      }
    } finally {
      probe.close();
      if (probeFile.existsSync()) probeFile.deleteSync();
    }

    _db?.close();
    _db = null;
    final live = File(_path!);
    for (final suffix in ['', '-wal', '-shm']) {
      final extra = File('${live.path}$suffix');
      if (suffix.isNotEmpty && extra.existsSync()) extra.deleteSync();
    }
    await live.writeAsBytes(bytes, flush: true);
    _db = sqlite3.open(_path!);
    _db!.execute('PRAGMA foreign_keys = ON;');
    refresh();
    notice = 'Ledger restored on this phone.';
    error = null;
  }

  Future<File> exportFile() async {
    final db = _require();
    db.execute('PRAGMA wal_checkpoint(FULL);');
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(':', '-')
        .replaceAll('.', '-')
        .split('Z')
        .first;
    final dir = await getTemporaryDirectory();
    final out = File(p.join(dir.path, 'luckygain-backup-$stamp.sqlite'));
    await File(_path!).copy(out.path);
    notice = out.uri.pathSegments.last;
    error = null;
    return out;
  }

  void refresh() {
    final db = _require();
    try {
      snapshot = LedgerSnapshot(
        ready: true,
        greetingName: _greeting(db),
        goodsCount: _count(db, 'goods', softDelete: true),
        projectCount: _count(db, 'projects', archived: true),
        releasedNetCents: _releasedNet(db),
        goods: _goods(db),
        projects: _projects(db),
        clients: _clients(db),
      );
      error = null;
    } catch (_) {
      snapshot = const LedgerSnapshot(ready: true);
      error = 'This backup opened, but some tables could not be read.';
    }
  }

  void clearNotice() {
    notice = null;
    error = null;
  }

  Database _require() {
    final db = _db;
    if (db == null) {
      throw StateError('Ledger is not open');
    }
    return db;
  }

  bool _hasTable(String name) {
    final rows = _db!.select(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
      [name],
    );
    return rows.isNotEmpty;
  }

  bool _hasColumn(Database db, String table, String column) {
    if (!_table(db, table)) return false;
    final info = db.select('PRAGMA table_info($table)');
    return info.any((row) => row['name'] == column);
  }

  bool _table(Database db, String name) {
    final rows = db.select(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
      [name],
    );
    return rows.isNotEmpty;
  }

  String? _greeting(Database db) {
    if (!_table(db, 'users') || !_hasColumn(db, 'users', 'greeting_name')) {
      return null;
    }
    final rows = db.select('SELECT greeting_name FROM users LIMIT 1');
    if (rows.isEmpty) return null;
    final name = rows.first['greeting_name'] as String?;
    if (name == null || name.trim().isEmpty) return null;
    return name.trim();
  }

  int _count(
    Database db,
    String table, {
    bool softDelete = false,
    bool archived = false,
  }) {
    if (!_table(db, table)) return 0;
    final filters = <String>[];
    if (softDelete && _hasColumn(db, table, 'soft_deleted')) {
      filters.add('soft_deleted = 0');
    }
    if (archived && _hasColumn(db, table, 'archived')) {
      filters.add('archived = 0');
    }
    final where = filters.isEmpty ? '' : ' WHERE ${filters.join(' AND ')}';
    final rows = db.select('SELECT COUNT(*) AS c FROM $table$where');
    return _int(rows.first['c']);
  }

  Map<String, int> goodsMonthCounts() {
    final db = _require();
    if (!_table(db, 'goods')) return const {};
    final where = _hasColumn(db, 'goods', 'soft_deleted')
        ? 'WHERE soft_deleted = 0 AND '
        : 'WHERE ';
    final rows = db.select('''
      SELECT substr(purchased_on, 1, 7) AS month, COUNT(*) AS c
      FROM goods
      $where length(purchased_on) >= 7
      GROUP BY month
      ''');
    return {
      for (final row in rows)
        if ((row['month'] as String?)?.length == 7)
          row['month'] as String: _int(row['c']),
    };
  }

  List<GoodRow> goodsInMonth(String monthKey) {
    final db = _require();
    if (!_table(db, 'goods') || monthKey.length != 7) return const [];
    final deleted = _hasColumn(db, 'goods', 'soft_deleted')
        ? 'AND soft_deleted = 0'
        : '';
    final rows = db.select(
      '''
      SELECT id, title, price_cents, purchased_on, for_whom, category, url, notes,
             image_data_url, returned_on, enabled, comment, called_price_cents
      FROM goods
      WHERE purchased_on LIKE ? $deleted
      ORDER BY purchased_on DESC, created_at DESC
      ''',
      ['$monthKey%'],
    );
    return rows.map(_mapGood).toList();
  }

  void saveGood(GoodRow next) {
    final db = _require();
    final title = next.title.trim();
    if (title.isEmpty) {
      throw const FormatException('Title is required');
    }
    if (next.priceCents < 0) {
      throw const FormatException('Price must be zero or positive');
    }
    final date = next.purchasedOn.length >= 10
        ? next.purchasedOn.substring(0, 10)
        : '';
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) {
      throw const FormatException('Invalid purchase date');
    }
    final existing = db.select(
      '''
      SELECT price_cents, for_whom, notes
      FROM goods
      WHERE id = ? ${_hasColumn(db, 'goods', 'soft_deleted') ? 'AND soft_deleted = 0' : ''}
      ''',
      [next.id],
    );
    if (existing.isEmpty) {
      throw const FormatException('Good not found');
    }
    final old = existing.first;
    final wasWallet = !_outside(
      old['for_whom'] as String?,
      old['notes'] as String?,
    );
    final nowWallet = !next.outsideWallet;
    final sets = <String>[
      'title = ?',
      'price_cents = ?',
      'purchased_on = ?',
      'for_whom = ?',
      'category = ?',
      'url = ?',
      'notes = ?',
    ];
    final args = <Object?>[
      title,
      next.priceCents,
      date,
      next.whom == 'self' ? 'me' : next.whom,
      next.category,
      _blank(next.url),
      _blank(next.notes),
    ];
    if (_hasColumn(db, 'goods', 'image_data_url')) {
      sets.add('image_data_url = ?');
      args.add(_blank(next.imageDataUrl));
    }
    if (_hasColumn(db, 'goods', 'enabled')) {
      sets.add('enabled = ?');
      args.add(next.enabled ? 1 : 0);
    }
    if (_hasColumn(db, 'goods', 'comment')) {
      sets.add('comment = ?');
      args.add(_blank(next.comment));
    }
    if (_hasColumn(db, 'goods', 'called_price_cents')) {
      sets.add('called_price_cents = ?');
      args.add(next.calledPriceCents);
    }
    sets.add("updated_at = datetime('now')");
    args.add(next.id);

    db.execute('BEGIN');
    try {
      db.execute('UPDATE goods SET ${sets.join(', ')} WHERE id = ?', args);
      _syncPurse(
        db,
        id: next.id,
        title: title,
        date: date,
        priceCents: next.priceCents,
        oldPrice: _int(old['price_cents']),
        wasWallet: wasWallet,
        nowWallet: nowWallet,
      );
      db.execute('COMMIT');
    } catch (error) {
      db.execute('ROLLBACK');
      rethrow;
    }
    refresh();
  }

  void _syncPurse(
    Database db, {
    required String id,
    required String title,
    required String date,
    required int priceCents,
    required int oldPrice,
    required bool wasWallet,
    required bool nowWallet,
  }) {
    if (!_table(db, 'purse_entries')) return;
    if (!wasWallet && !nowWallet) return;
    if (wasWallet && !nowWallet) {
      db.execute(
        '''
        UPDATE purse_entries
        SET soft_deleted = 1, updated_at = datetime('now')
        WHERE goods_id = ? AND soft_deleted = 0
        ''',
        [id],
      );
      return;
    }
    if (!wasWallet && nowWallet) {
      if (priceCents > 0) {
        db.execute(
          '''
          INSERT INTO purse_entries
            (id, kind, amount_cents, occurred_on, note, goods_id)
          VALUES (?, 'goods_debit', ?, ?, ?, ?)
          ''',
          [_entryId(), priceCents, date, title, id],
        );
      }
      return;
    }
    final delta = priceCents - oldPrice;
    if (delta > 0) {
      db.execute(
        '''
        INSERT INTO purse_entries
          (id, kind, amount_cents, occurred_on, note, goods_id)
        VALUES (?, 'goods_debit', ?, ?, ?, ?)
        ''',
        [_entryId(), delta, date, 'Price up · $title', id],
      );
    } else if (delta < 0) {
      db.execute(
        '''
        INSERT INTO purse_entries
          (id, kind, amount_cents, occurred_on, note, goods_id)
        VALUES (?, 'goods_credit', ?, ?, ?, ?)
        ''',
        [_entryId(), -delta, date, 'Price down · $title', id],
      );
    } else {
      db.execute(
        '''
        UPDATE purse_entries
        SET occurred_on = ?, note = ?, updated_at = datetime('now')
        WHERE goods_id = ? AND kind = 'goods_debit' AND soft_deleted = 0
          AND id = (
            SELECT id FROM purse_entries
            WHERE goods_id = ? AND kind = 'goods_debit' AND soft_deleted = 0
            ORDER BY created_at ASC LIMIT 1
          )
        ''',
        [date, title, id, id],
      );
    }
  }

  GoodRow _mapGood(Row row) {
    final title = (row['title'] as String?)?.trim();
    final called = row['called_price_cents'];
    return GoodRow(
      id: (row['id'] as String?) ?? '',
      title: title == null || title.isEmpty ? 'Untitled' : title,
      priceCents: _int(row['price_cents']),
      purchasedOn: (row['purchased_on'] as String?) ?? '',
      whom: (row['for_whom'] as String?) ?? 'me',
      category: (row['category'] as String?) ?? 'other',
      url: row['url'] as String?,
      notes: row['notes'] as String?,
      imageDataUrl: row['image_data_url'] as String?,
      returnedOn: row['returned_on'] as String?,
      enabled: row['enabled'] == null || _int(row['enabled']) != 0,
      comment: row['comment'] as String?,
      calledPriceCents: called == null ? null : _int(called),
    );
  }

  bool _outside(String? whom, String? notes) {
    return whom == 'self' || (notes ?? '').contains('[outside-wallet]');
  }

  String? _blank(String? value) {
    final text = value?.trim();
    if (text == null || text.isEmpty) return null;
    return text;
  }

  String _entryId() {
    final stamp = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final salt = Random().nextInt(1 << 20).toRadixString(36);
    return 'pse_$stamp$salt';
  }

  List<GoodRow> _goods(Database db) {
    if (!_table(db, 'goods')) return const [];
    final where = _hasColumn(db, 'goods', 'soft_deleted')
        ? 'WHERE soft_deleted = 0'
        : '';
    final rows = db.select('''
      SELECT title, price_cents, purchased_on, for_whom
      FROM goods
      $where
      ORDER BY purchased_on DESC
      LIMIT 80
      ''');
    return rows
        .map(
          (row) => GoodRow(
            title: (row['title'] as String?)?.trim().isNotEmpty == true
                ? row['title'] as String
                : 'Untitled',
            priceCents: _int(row['price_cents']),
            purchasedOn: (row['purchased_on'] as String?) ?? '',
            whom: (row['for_whom'] as String?) ?? '',
          ),
        )
        .toList();
  }

  List<ProjectRow> _projects(Database db) {
    if (!_table(db, 'projects') || !_table(db, 'clients')) return const [];
    final archived = _hasColumn(db, 'projects', 'archived')
        ? 'WHERE p.archived = 0'
        : '';
    final rows = db.select('''
      SELECT p.name AS name, c.name AS client_name,
             COALESCE(p.project_type, '') AS project_type, p.id AS id
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      $archived
      ORDER BY c.name COLLATE NOCASE, p.name COLLATE NOCASE
      ''');
    final nets = _projectNets(db);
    return rows
        .map(
          (row) => ProjectRow(
            name: (row['name'] as String?) ?? 'Project',
            clientName: (row['client_name'] as String?) ?? '',
            projectType: (row['project_type'] as String?) ?? '',
            releasedNetCents: nets[row['id'] as String] ?? 0,
          ),
        )
        .toList();
  }

  Map<String, int> _projectNets(Database db) {
    final nets = <String, int>{};
    if (!_table(db, 'milestones')) return nets;
    final rows = db.select('''
      SELECT project_id, gross_cents, transfer_fee_bps, account_fee_bps,
             fee_compound, status
      FROM milestones
      ''');
    for (final row in rows) {
      if (row['status'] != 'released') continue;
      final id = row['project_id'] as String;
      nets[id] = (nets[id] ?? 0) + _net(row);
    }
    return nets;
  }

  List<ClientRollup> _clients(Database db) {
    final byKey = <String, _ClientAcc>{};
    for (final project in _projects(db)) {
      final key = project.clientName.trim().toLowerCase();
      if (key.isEmpty) continue;
      final acc = byKey.putIfAbsent(
        key,
        () => _ClientAcc(project.clientName.trim()),
      );
      acc.projectCount += 1;
      acc.releasedNetCents += project.releasedNetCents;
    }
    final list = byKey.values
        .map(
          (acc) => ClientRollup(
            name: acc.name,
            releasedNetCents: acc.releasedNetCents,
            projectCount: acc.projectCount,
          ),
        )
        .toList();
    list.sort((a, b) {
      final byMoney = b.releasedNetCents.compareTo(a.releasedNetCents);
      if (byMoney != 0) return byMoney;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    return list;
  }

  int _releasedNet(Database db) {
    if (!_table(db, 'milestones')) return 0;
    final rows = db.select('''
      SELECT gross_cents, transfer_fee_bps, account_fee_bps, fee_compound, status
      FROM milestones
      ''');
    var sum = 0;
    for (final row in rows) {
      if (row['status'] == 'released') sum += _net(row);
    }
    return sum;
  }

  int _net(Row row) {
    final gross = _int(row['gross_cents']);
    final transfer = _fee(gross, _int(row['transfer_fee_bps']));
    final compound = _int(row['fee_compound']) == 1;
    if (compound) {
      final after = gross - transfer;
      return after - _fee(after, _int(row['account_fee_bps']));
    }
    return gross - transfer - _fee(gross, _int(row['account_fee_bps']));
  }

  int _fee(int gross, int bps) => ((gross * bps) / 10000).round();

  int _int(Object? value) {
    if (value is int) return value;
    if (value is BigInt) return value.toInt();
    if (value is num) return value.round();
    return 0;
  }

  void _execScript(Database db, String script) {
    for (final statement in _splitSql(_stripSqlComments(script))) {
      db.execute(statement);
    }
  }

  List<String> _splitSql(String sql) {
    final statements = <String>[];
    final buf = StringBuffer();
    var inQuote = false;
    for (var i = 0; i < sql.length; i++) {
      final char = sql[i];
      if (char == "'") {
        if (inQuote && i + 1 < sql.length && sql[i + 1] == "'") {
          buf.write("''");
          i++;
          continue;
        }
        inQuote = !inQuote;
        buf.write(char);
        continue;
      }
      if (char == ';' && !inQuote) {
        final text = buf.toString().trim();
        if (text.isNotEmpty) statements.add(text);
        buf.clear();
        continue;
      }
      buf.write(char);
    }
    final tail = buf.toString().trim();
    if (tail.isNotEmpty) statements.add(tail);
    return statements;
  }

  String _stripSqlComments(String sql) {
    final buf = StringBuffer();
    var i = 0;
    while (i < sql.length) {
      final next = i + 1 < sql.length ? sql[i + 1] : '';
      if (sql[i] == '-' && next == '-') {
        while (i < sql.length && sql[i] != '\n') {
          i++;
        }
        continue;
      }
      if (sql[i] == '/' && next == '*') {
        i += 2;
        while (i + 1 < sql.length && !(sql[i] == '*' && sql[i + 1] == '/')) {
          i++;
        }
        i = (i + 2).clamp(0, sql.length);
        buf.write(' ');
        continue;
      }
      buf.write(sql[i]);
      i++;
    }
    return buf.toString();
  }

  void dispose() {
    _db?.close();
    _db = null;
  }
}

class _ClientAcc {
  _ClientAcc(this.name);
  final String name;
  int releasedNetCents = 0;
  int projectCount = 0;
}
