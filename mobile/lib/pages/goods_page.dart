import 'package:flutter/material.dart';

import '../db/ledger_store.dart';
import '../lock/app_lock.dart';
import '../money.dart';
import '../theme/lg_colors.dart';
import '../widgets/lg_motion.dart';
import '../widgets/lg_widgets.dart';
import 'good_detail_page.dart';

const _monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const _monthShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

class GoodsPage extends StatefulWidget {
  const GoodsPage({super.key, required this.store, required this.lock});

  final LedgerStore store;
  final AppLock lock;

  @override
  State<GoodsPage> createState() => _GoodsPageState();
}

class _GoodsPageState extends State<GoodsPage> {
  Map<String, int> _counts = const {};
  List<GoodRow> _goods = const [];
  late String _month;
  final _checked = <String>{};

  @override
  void initState() {
    super.initState();
    _month = _todayMonth();
    _apply(preferLatest: true);
    widget.store.addListener(_onStore);
  }

  void _onStore() {
    if (!mounted) return;
    setState(() => _apply());
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStore);
    super.dispose();
  }

  String _todayMonth() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}';
  }

  void _apply({bool preferLatest = false}) {
    final counts = widget.store.goodsMonthCounts();
    var month = _month;
    if (preferLatest && !counts.containsKey(month) && counts.isNotEmpty) {
      final latest = counts.keys.toList()..sort();
      month = latest.last;
    }
    _counts = counts;
    _month = month;
    _goods = widget.store.goodsInMonth(month);
    _checked.removeWhere((id) => _goods.every((good) => good.id != id));
  }

  void _reload() => setState(_apply);

  Future<void> _pickMonth() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Lg.panel,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => _MonthSheet(month: _month, counts: _counts),
    );
    if (picked == null || picked == _month) return;
    setState(() {
      _month = picked;
      _checked.clear();
    });
    _reload();
  }

  Future<void> _open(GoodRow good) async {
    final saved = await Navigator.of(context).push<bool>(
      LgPageRoute<bool>(
        builder: (_) =>
            GoodDetailPage(store: widget.store, lock: widget.lock, good: good),
      ),
    );
    if (saved == true) _reload();
  }

  void _toggleAll() {
    final ids = _goods.map((good) => good.id).toList();
    setState(() {
      if (ids.isNotEmpty && ids.every(_checked.contains)) {
        _checked.clear();
      } else {
        _checked
          ..clear()
          ..addAll(ids);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final year = int.parse(_month.substring(0, 4));
    final monthNum = int.parse(_month.substring(5, 7));
    final allChecked =
        _goods.isNotEmpty && _goods.every((g) => _checked.contains(g.id));
    final total = _goods
        .where((good) => good.enabled)
        .fold<int>(0, (sum, good) => sum + good.priceCents);
    final off = _goods.where((good) => !good.enabled).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        const LgEyebrow('Purchases'),
        const SizedBox(height: 6),
        const LgTitle('Goods'),
        const SizedBox(height: 14),
        Align(
          alignment: Alignment.centerLeft,
          child: Material(
            color: Lg.goldSoft,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              onTap: _pickMonth,
              borderRadius: BorderRadius.circular(14),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.calendar_month_outlined,
                      size: 18,
                      color: Lg.goldDark,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${_monthNames[monthNum - 1]} $year',
                      style: const TextStyle(
                        fontFamily: Lg.sans,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Lg.goldDark,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.expand_more, size: 18, color: Lg.goldDark),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (_goods.isEmpty)
          const _Empty(
            title: 'Nothing this month',
            body:
                'Choose another month, or restore a desktop backup from Ledger.',
          )
        else ...[
          Row(
            children: [
              _Check(on: allChecked, onTap: _toggleAll),
              const SizedBox(width: 10),
              const Text(
                'Select all',
                style: TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: Lg.charcoal,
                ),
              ),
              const Spacer(),
              Text(
                off == 0
                    ? '${_goods.length} · ${formatYuan(total)}'
                    : '${_goods.length} · ${formatYuan(total)} · $off off',
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 12.5,
                  color: Lg.muted,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final good in _goods) ...[
            _GoodTile(
              good: good,
              checked: _checked.contains(good.id),
              onCheck: () => setState(() {
                if (!_checked.add(good.id)) _checked.remove(good.id);
              }),
              onOpen: () => _open(good),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }
}

class _GoodTile extends StatelessWidget {
  const _GoodTile({
    required this.good,
    required this.checked,
    required this.onCheck,
    required this.onOpen,
  });

  final GoodRow good;
  final bool checked;
  final VoidCallback onCheck;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final whom = good.outsideWallet
        ? '${whomLabel(good.whom == 'self' ? 'me' : good.whom)} · Self'
        : whomLabel(good.whom);
    return LgCard(
      padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
      color: good.enabled ? null : const Color(0xFFFFF6F3),
      borderColor: good.enabled ? null : const Color(0x66E38874),
      child: Row(
        children: [
          _Check(on: checked, onTap: onCheck),
          const SizedBox(width: 8),
          Expanded(
            child: InkWell(
              onTap: onOpen,
              borderRadius: BorderRadius.circular(16),
              child: Row(
                children: [
                  GoodPhoto(dataUrl: good.imageDataUrl),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          good.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: Lg.sans,
                            fontWeight: FontWeight.w600,
                            fontSize: 14.5,
                            color: Lg.charcoal,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Container(
                              width: 18,
                              height: 18,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: Lg.emeraldSoft,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Icon(
                                goodCategoryOf(good.category).icon,
                                size: 12,
                                color: Lg.emerald,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                '${formatDotDate(good.purchasedOn)} · $whom',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontFamily: Lg.sans,
                                  fontSize: 12,
                                  color: Lg.muted,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (good.returnedOn != null)
                          const Padding(
                            padding: EdgeInsets.only(top: 2),
                            child: Text(
                              'RETURNED',
                              style: TextStyle(
                                fontFamily: Lg.sans,
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.8,
                                color: Lg.emerald,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      _CountPill(on: good.enabled),
                      const SizedBox(height: 8),
                      Text(
                        formatYuan(-good.priceCents),
                        style: TextStyle(
                          fontFamily: Lg.sans,
                          fontWeight: FontWeight.w600,
                          color: good.enabled ? Lg.coral : Lg.muted,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.on});

  final bool on;

  @override
  Widget build(BuildContext context) {
    final tone = on ? Lg.emerald : Lg.coral;
    final wash = on ? Lg.emeraldSoft : Lg.coralSoft;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: wash,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.withValues(alpha: 0.35)),
      ),
      child: Text(
        on ? 'On' : 'Off',
        style: TextStyle(
          fontFamily: Lg.sans,
          fontSize: 10.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
          color: tone,
        ),
      ),
    );
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.on, required this.onTap});

  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: on ? Lg.goldDark : Colors.transparent,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(color: on ? Lg.goldDark : Lg.line, width: 1.4),
        ),
        child: on
            ? const Icon(Icons.check, size: 14, color: Colors.white)
            : null,
      ),
    );
  }
}

class _MonthSheet extends StatefulWidget {
  const _MonthSheet({required this.month, required this.counts});

  final String month;
  final Map<String, int> counts;

  @override
  State<_MonthSheet> createState() => _MonthSheetState();
}

class _MonthSheetState extends State<_MonthSheet> {
  late int _year;

  @override
  void initState() {
    super.initState();
    _year = int.parse(widget.month.substring(0, 4));
  }

  @override
  Widget build(BuildContext context) {
    final years = widget.counts.keys.map(
      (key) => int.parse(key.substring(0, 4)),
    );
    final now = DateTime.now().year;
    final minYear = years.fold<int>(
      now,
      (min, year) => year < min ? year : min,
    );
    final maxYear = years.fold<int>(
      now,
      (max, year) => year > max ? year : max,
    );
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Lg.line,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: _year <= minYear
                      ? null
                      : () => setState(() => _year--),
                  icon: const Icon(Icons.chevron_left, color: Lg.charcoal),
                ),
                Text(
                  '$_year',
                  style: const TextStyle(
                    fontFamily: Lg.display,
                    fontSize: 26,
                    fontWeight: FontWeight.w600,
                    color: Lg.charcoal,
                  ),
                ),
                IconButton(
                  onPressed: _year >= maxYear
                      ? null
                      : () => setState(() => _year++),
                  icon: const Icon(Icons.chevron_right, color: Lg.charcoal),
                ),
              ],
            ),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 2.1,
              children: [
                for (var month = 1; month <= 12; month++)
                  _MonthCell(
                    label: _monthShort[month - 1],
                    count:
                        widget
                            .counts['$_year-${month.toString().padLeft(2, '0')}'] ??
                        0,
                    selected:
                        widget.month ==
                        '$_year-${month.toString().padLeft(2, '0')}',
                    onTap: () => Navigator.pop(
                      context,
                      '$_year-${month.toString().padLeft(2, '0')}',
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MonthCell extends StatelessWidget {
  const _MonthCell({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Lg.goldSoft : Lg.ivory,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? Lg.gold : Lg.line),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontFamily: Lg.sans,
                  fontWeight: FontWeight.w600,
                  color: selected ? Lg.goldDark : Lg.charcoal,
                ),
              ),
              Text(
                count == 0 ? '—' : '$count',
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 11,
                  color: Lg.muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return LgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: Lg.display,
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: Lg.charcoal,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            style: const TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13.5,
              height: 1.45,
              color: Lg.muted,
            ),
          ),
        ],
      ),
    );
  }
}
