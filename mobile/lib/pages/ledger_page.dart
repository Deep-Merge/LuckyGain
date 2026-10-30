import 'package:flutter/material.dart';

import '../lock/app_lock.dart';
import '../lock/lock_setup_page.dart';
import '../theme/lg_colors.dart';
import '../widgets/lg_motion.dart';
import '../widgets/lg_widgets.dart';

class LedgerPage extends StatelessWidget {
  const LedgerPage({
    super.key,
    required this.lock,
    required this.busy,
    required this.notice,
    required this.error,
    required this.onRestore,
    required this.onExport,
  });

  final AppLock lock;
  final bool busy;
  final String? notice;
  final String? error;
  final VoidCallback onRestore;
  final VoidCallback onExport;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        const LgEyebrow('This phone'),
        const SizedBox(height: 6),
        const LgTitle('Ledger'),
        const SizedBox(height: 8),
        const Text(
          'The database stays on the device. Restore a .sqlite file from the computer, or export one back.',
          style: TextStyle(
            fontFamily: Lg.sans,
            fontSize: 13.5,
            height: 1.45,
            color: Lg.muted,
          ),
        ),
        const SizedBox(height: 18),
        _LockCard(lock: lock),
        const SizedBox(height: 14),
        const LgCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LgEyebrow('Backup'),
              SizedBox(height: 8),
              Text(
                'Desktop Settings downloads the same file. Pick it here to replace the phone ledger. Export shares a file the desktop can restore.',
                style: TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 13.5,
                  height: 1.45,
                  color: Lg.muted,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        LgButton(
          label: busy ? 'Working…' : 'Restore from backup',
          busy: busy,
          onPressed: onRestore,
        ),
        const SizedBox(height: 10),
        LgButton(
          label: 'Export backup',
          filled: false,
          onPressed: busy ? null : onExport,
        ),
        if (error != null) ...[
          const SizedBox(height: 14),
          Text(
            error!,
            style: const TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13,
              color: Lg.coral,
            ),
          ),
        ],
        if (notice != null) ...[
          const SizedBox(height: 14),
          Text(
            notice!,
            style: const TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13,
              color: Lg.emerald,
            ),
          ),
        ],
      ],
    );
  }
}

class _LockCard extends StatefulWidget {
  const _LockCard({required this.lock});

  final AppLock lock;

  @override
  State<_LockCard> createState() => _LockCardState();
}

class _LockCardState extends State<_LockCard> {
  var _busy = false;
  String? _note;

  AppLock get lock => widget.lock;

  @override
  void initState() {
    super.initState();
    lock.addListener(_onLock);
  }

  @override
  void dispose() {
    lock.removeListener(_onLock);
    super.dispose();
  }

  void _onLock() {
    if (mounted) setState(() {});
  }

  Future<void> _open(LockSetupKind kind) {
    return Navigator.of(context).push(
      LgPageRoute<void>(
        builder: (_) => LockSetupPage(lock: lock, kind: kind),
      ),
    );
  }

  Future<void> _toggleFingerprint(bool enabled) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _note = null;
    });
    if (!enabled) {
      await lock.disableFingerprint();
    } else {
      final message = await lock.enableFingerprint();
      if (mounted && message != null) setState(() => _note = message);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return LgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const LgEyebrow('Lock'),
          const SizedBox(height: 8),
          const Text(
            'A password stays on this phone. Fingerprint opens the same lock. Neither is part of the ledger backup.',
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13.5,
              height: 1.45,
              color: Lg.muted,
            ),
          ),
          const SizedBox(height: 14),
          if (!lock.hasPassword)
            LgButton(
              label: 'Set a password',
              onPressed: () => _open(LockSetupKind.create),
            )
          else ...[
            Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Fingerprint',
                        style: TextStyle(
                          fontFamily: Lg.sans,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Lg.charcoal,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Unlock with the fingerprint on this phone.',
                        style: TextStyle(
                          fontFamily: Lg.sans,
                          fontSize: 12.5,
                          height: 1.35,
                          color: Lg.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: lock.biometricEnabled,
                  onChanged: lock.biometricAvailable && !_busy
                      ? _toggleFingerprint
                      : null,
                ),
              ],
            ),
            if (!lock.biometricAvailable)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text(
                  'This phone has no fingerprint reader.',
                  style: TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 12.5,
                    color: Lg.muted,
                  ),
                ),
              ),
            if (_note != null) ...[
              const SizedBox(height: 8),
              Text(
                _note!,
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 13,
                  color: Lg.coral,
                ),
              ),
            ],
            const SizedBox(height: 12),
            LgButton(
              label: 'Change password',
              onPressed: () => _open(LockSetupKind.change),
            ),
            const SizedBox(height: 10),
            LgButton(
              label: 'Remove password',
              filled: false,
              onPressed: () => _open(LockSetupKind.remove),
            ),
          ],
        ],
      ),
    );
  }
}
