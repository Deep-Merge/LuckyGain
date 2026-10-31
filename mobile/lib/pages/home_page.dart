import 'package:flutter/material.dart';

import '../db/ledger_store.dart';
import '../money.dart';
import '../theme/lg_colors.dart';
import '../widgets/lg_widgets.dart';

class HomePage extends StatelessWidget {
  const HomePage({
    super.key,
    required this.snapshot,
    required this.onOpenLedger,
  });

  final LedgerSnapshot snapshot;
  final VoidCallback onOpenLedger;

  @override
  Widget build(BuildContext context) {
    final name = snapshot.greetingName;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        const LgEyebrow('Local ledger'),
        const SizedBox(height: 6),
        LgTitle(name == null ? 'LuckyGain' : 'Hello, $name'),
        const SizedBox(height: 8),
        const Text(
          'Offline on this phone. A desktop backup restores the same ledger.',
          style: TextStyle(
            fontFamily: Lg.sans,
            fontSize: 13.5,
            height: 1.45,
            color: Lg.muted,
          ),
        ),
        const SizedBox(height: 22),
        if (!snapshot.hasActivity)
          LgCard(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const LgEyebrow('Empty phone'),
                const SizedBox(height: 8),
                const LgTitle('Bring your ledger', size: 26),
                const SizedBox(height: 8),
                const Text(
                  'Export a .sqlite backup from LuckyGain on the computer, then restore it here. Nothing is sent to a server.',
                  style: TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 13.5,
                    height: 1.45,
                    color: Lg.muted,
                  ),
                ),
                const SizedBox(height: 16),
                LgButton(label: 'Restore a backup', onPressed: onOpenLedger),
              ],
            ),
          )
        else ...[
          _Stat(label: 'Goods', value: '${snapshot.goodsCount}'),
          const SizedBox(height: 22),
          const LgEyebrow('Recent goods'),
          const SizedBox(height: 10),
          if (snapshot.goods.isEmpty)
            const Text(
              'No goods in this backup.',
              style: TextStyle(color: Lg.muted, fontFamily: Lg.sans),
            )
          else
            ...snapshot.goods
                .take(6)
                .map(
                  (good) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: LgCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  good.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontFamily: Lg.sans,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                    color: Lg.charcoal,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  good.enabled
                                      ? '${formatDotDate(good.purchasedOn)} · ${whomLabel(good.whom)}'
                                      : '${formatDotDate(good.purchasedOn)} · ${whomLabel(good.whom)} · Off',
                                  style: TextStyle(
                                    fontFamily: Lg.sans,
                                    fontSize: 12,
                                    color: good.enabled ? Lg.muted : Lg.coral,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            formatYuan(good.priceCents),
                            style: const TextStyle(
                              fontFamily: Lg.sans,
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                              color: Lg.ink,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
        ],
        const SizedBox(height: 28),
        const Center(
          child: Text(
            'MAKE YOUR LUCK',
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 2.4,
              color: Lg.gold,
            ),
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return LgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LgEyebrow(label, color: Lg.muted),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              fontFamily: Lg.display,
              fontSize: 26,
              fontWeight: FontWeight.w600,
              color: Lg.charcoal,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
