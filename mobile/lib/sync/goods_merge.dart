import 'package:sqlite3/sqlite3.dart';

const _goodsFields = [
  'title',
  'price_cents',
  'purchased_on',
  'for_whom',
  'category',
  'url',
  'notes',
  'image_data_url',
  'returned_on',
  'enabled',
  'comment',
  'called_price_cents',
  'soft_deleted',
  'created_at',
  'updated_at',
];

const _purseFields = [
  'id',
  'kind',
  'amount_cents',
  'occurred_on',
  'note',
  'goods_id',
  'soft_deleted',
  'created_at',
  'updated_at',
];

class SyncChange {
  const SyncChange({required this.title, required this.action});

  final String title;
  final String action;
}

class SyncCounts {
  const SyncCounts({
    required this.inserted,
    required this.updated,
    required this.unchanged,
    this.changes = const [],
  });

  final int inserted;
  final int updated;
  final int unchanged;
  final List<SyncChange> changes;
}

List<Map<String, dynamic>> syncCatalog(Database db) {
  final rows = db.select(
    'SELECT id, title, price_cents, purchased_on, for_whom, updated_at, soft_deleted FROM goods',
  );
  return [
    for (final row in rows)
      if ('${row['id'] ?? ''}'.trim().isNotEmpty)
        {
          'id': '${row['id']}'.trim(),
          'updatedAt': '${row['updated_at'] ?? ''}',
          'deleted': row['soft_deleted'] == 1,
          'title': '${row['title'] ?? ''}',
          'purchasedOn': '${row['purchased_on'] ?? ''}',
          'priceCents': row['price_cents'] ?? 0,
          'forWhom': '${row['for_whom'] ?? ''}',
        },
  ];
}

List<Map<String, dynamic>> syncRecords(Database db, List<String> ids) {
  final records = <Map<String, dynamic>>[];
  for (final id in ids) {
    final goods = db.select('SELECT * FROM goods WHERE id = ?', [id]);
    if (goods.isEmpty) continue;
    final purse = db.select(
      'SELECT * FROM purse_entries WHERE goods_id = ?',
      [id],
    );
    records.add({
      'good': _plain(goods.first),
      'purse': [for (final row in purse) _plain(row)],
    });
  }
  return records;
}

SyncCounts applyIncomingGoods(
  Database db,
  List<Map<String, dynamic>> records,
) {
  var inserted = 0;
  var updated = 0;
  var unchanged = 0;
  final changes = <SyncChange>[];
  db.execute('BEGIN');
  try {
    for (final record in records) {
      final good = Map<String, dynamic>.from(record['good'] as Map);
      final id = '${good['id'] ?? ''}'.trim();
      if (id.isEmpty) continue;
      var current = db.select(
        'SELECT id, updated_at FROM goods WHERE id = ?',
        [id],
      );
      if (current.isEmpty) {
        current = _findTwin(db, good);
      }
      final purse = [
        for (final row in (record['purse'] as List? ?? const []))
          Map<String, dynamic>.from(row as Map),
      ];
      if (current.isEmpty) {
        if (good['soft_deleted'] == 1) {
          unchanged += 1;
          continue;
        }
        _insert(db, 'goods', ['id', ..._goodsFields], {...good, 'id': id});
        _replacePurse(db, id, purse);
        inserted += 1;
        changes.add(SyncChange(title: _goodTitle(good), action: 'added'));
        continue;
      }
      final keepId = '${current.first['id'] ?? id}'.trim();
      final incomingAt = '${good['updated_at'] ?? ''}';
      final localAt = '${current.first['updated_at'] ?? ''}';
      if (incomingAt.compareTo(localAt) > 0) {
        _update(db, good, keepId);
        _replacePurse(db, keepId, purse);
        updated += 1;
        changes.add(SyncChange(title: _goodTitle(good), action: 'updated'));
      } else {
        unchanged += 1;
      }
    }
    db.execute('COMMIT');
  } catch (error) {
    db.execute('ROLLBACK');
    rethrow;
  }
  return SyncCounts(
    inserted: inserted,
    updated: updated,
    unchanged: unchanged,
    changes: changes,
  );
}

String _goodTitle(Map<String, dynamic> good) {
  final title = '${good['title'] ?? ''}'.trim();
  return title.isEmpty ? 'Untitled' : title;
}

ResultSet _findTwin(Database db, Map<String, dynamic> good) {
  final title = '${good['title'] ?? ''}'.trim();
  final purchasedOn = '${good['purchased_on'] ?? ''}'.trim();
  if (title.isEmpty || purchasedOn.isEmpty) {
    return db.select('SELECT id, updated_at FROM goods WHERE 0');
  }
  return db.select(
    '''
    SELECT id, updated_at FROM goods
    WHERE lower(trim(title)) = lower(?)
      AND purchased_on = ?
      AND price_cents = ?
      AND lower(trim(for_whom)) = lower(?)
    LIMIT 1
    ''',
    [
      title,
      purchasedOn,
      good['price_cents'] ?? 0,
      '${good['for_whom'] ?? ''}'.trim(),
    ],
  );
}

Map<String, dynamic> _plain(Map<String, Object?> row) {
  return {for (final entry in row.entries) entry.key: entry.value};
}

void _insert(
  Database db,
  String table,
  List<String> fields,
  Map<String, dynamic> row,
) {
  final names = [for (final field in fields) if (row.containsKey(field)) field];
  if (names.isEmpty) return;
  db.execute(
    'INSERT INTO $table (${names.join(', ')}) VALUES (${List.filled(names.length, '?').join(', ')})',
    [for (final name in names) row[name]],
  );
}

void _update(Database db, Map<String, dynamic> good, String id) {
  final names = [
    for (final field in _goodsFields)
      if (good.containsKey(field)) field,
  ];
  if (names.isEmpty) return;
  db.execute(
    'UPDATE goods SET ${names.map((name) => '$name = ?').join(', ')} WHERE id = ?',
    [for (final name in names) good[name], id],
  );
}

void _replacePurse(Database db, String goodsId, List<Map<String, dynamic>> rows) {
  db.execute('DELETE FROM purse_entries WHERE goods_id = ?', [goodsId]);
  for (final row in rows) {
    var id = row['id'] as String? ?? '';
    if (id.isEmpty) continue;
    final taken = db.select('SELECT id FROM purse_entries WHERE id = ?', [id]);
    if (taken.isNotEmpty) id = '${id}_m';
    _insert(db, 'purse_entries', _purseFields, {...row, 'id': id, 'goods_id': goodsId});
  }
}
