import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../db/ledger_store.dart';
import '../lock/app_lock.dart';
import '../lock/lock_setup_page.dart';
import '../sync/goods_merge.dart';
import '../sync/phone_sync.dart';
import '../sync/wifi_session.dart';
import '../sync/wifi_sync.dart';
import '../theme/lg_colors.dart';
import '../widgets/lg_motion.dart';
import '../widgets/lg_widgets.dart';

class LedgerPage extends StatelessWidget {
  const LedgerPage({
    super.key,
    required this.store,
    required this.lock,
    required this.busy,
    required this.notice,
    required this.error,
    required this.onRestore,
    required this.onExport,
  });

  final LedgerStore store;
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
        _SyncCard(store: store, lock: lock),
        const SizedBox(height: 14),
        _LockCard(lock: lock),
        const SizedBox(height: 14),
        const LgCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LgEyebrow('Backup'),
              SizedBox(height: 8),
              Text(
                'Desktop Settings downloads the same file. Pick it here to replace the phone ledger. Export saves a .sqlite file in this phone’s Downloads folder.',
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

class _SyncCard extends StatefulWidget {
  const _SyncCard({required this.store, required this.lock});

  final LedgerStore store;
  final AppLock lock;

  @override
  State<_SyncCard> createState() => _SyncCardState();
}

class _SyncCardState extends State<_SyncCard> {
  late final WifiPhoneLink _link;
  final _host = TextEditingController();
  final _code = TextEditingController();
  var _open = false;
  var _busy = false;
  var _hydrating = false;
  String? _status;
  String? _error;
  SyncProgress? _progress;
  Timer? _saveTimer;

  @override
  void initState() {
    super.initState();
    _link = WifiSession.instance.attach(widget.store);
    _open = _link.connected;
    _host.addListener(_remember);
    _code.addListener(_remember);
    _link.onChange = () {
      if (!mounted) return;
      setState(() {
        if (!_link.connected) _open = false;
      });
    };
    _link.onProgress = (progress) {
      if (mounted) {
        setState(() {
          _progress = progress;
          _status = null;
          _error = null;
        });
      }
    };
    _link.onStatus = (text) {
      if (!mounted) return;
      setState(() {
        _status = text;
        _progress = null;
        _error = null;
        _busy = false;
      });
    };
    _link.onError = (message) {
      if (!mounted) return;
      setState(() {
        _error = message;
        _progress = null;
        _busy = false;
      });
    };
    _link.onReport = (report) {
      if (!mounted) return;
      setState(() {
        _status = null;
        _progress = null;
        _error = null;
        _busy = false;
      });
      _showReport(report);
    };
    _loadSaved();
  }

  Future<void> _loadSaved() async {
    final saved = await loadWifiSync();
    if (!mounted) return;
    _hydrating = true;
    if (_host.text.isEmpty && saved.host.isNotEmpty) _host.text = saved.host;
    if (_code.text.isEmpty && saved.code.isNotEmpty) _code.text = saved.code;
    _hydrating = false;
  }

  void _remember() {
    if (_hydrating) return;
    _saveTimer?.cancel();
    final host = _host.text;
    final code = _code.text;
    _saveTimer = Timer(const Duration(milliseconds: 200), () {
      unawaited(saveWifiSync(host, code));
    });
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    unawaited(saveWifiSync(_host.text, _code.text));
    _link.onChange = null;
    _link.onProgress = null;
    _link.onStatus = null;
    _link.onReport = null;
    _link.onError = null;
    _host.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    if (_busy) return;
    final host = wifiHost(_host.text);
    final code = wifiCode(_code.text);
    if (host == null) {
      setState(() => _error = 'Enter the computer address.');
      return;
    }
    if (code == null) {
      setState(() => _error = 'Enter the 4-digit code from the computer.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _status = null;
    });
    try {
      await _link.open(host, code);
      _host.text = host;
      _code.text = code;
      try {
        await saveWifiSync(host, code);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _open = true;
        _busy = false;
        _status = 'Connected. Tap Sync on either side.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _open = false;
        _busy = false;
        _error = wifiFailure(error);
      });
    }
  }

  Future<void> _disconnect() async {
    await _link.close();
    if (!mounted) return;
    setState(() {
      _open = false;
      _status = null;
      _progress = null;
    });
  }

  Future<void> _showReport(SyncOutcome report) {
    return showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Dismiss',
      barrierColor: const Color(0x662A2F2B),
      transitionDuration: const Duration(milliseconds: 280),
      pageBuilder: (context, animation, secondary) {
        return _SyncResultDialog(report: report);
      },
      transitionBuilder: (context, animation, secondary, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return FadeTransition(
          opacity: curved,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.97, end: 1).animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  Future<void> _sync() async {
    if (!_open) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    await _link.begin();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final connected = _link.connected && _open;
    return LgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const LgEyebrow('Sync'),
          const SizedBox(height: 8),
          const Text(
            'Same Wi-Fi as the computer. Enter the address and code shown in Settings, then tap Sync. The newer good wins on both sides. Projects stay on the computer.',
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13.5,
              height: 1.45,
              color: Lg.muted,
            ),
          ),
          const SizedBox(height: 14),
          _SyncField(
            controller: _host,
            label: 'Computer address',
            hint: '192.168.1.20',
            enabled: !_open,
          ),
          const SizedBox(height: 10),
          _SyncField(
            controller: _code,
            label: 'Code',
            hint: '4 digits',
            enabled: !_open,
            digits: true,
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _SyncAction(
                  label: _open ? 'Disconnect' : 'Connect',
                  icon: _open ? Icons.link_off_rounded : Icons.wifi_rounded,
                  filled: !_open,
                  busy: _busy && !_open,
                  onPressed: _busy && !_open
                      ? null
                      : () => _open ? _disconnect() : _connect(),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SyncAction(
                  label: 'Sync goods',
                  icon: Icons.sync_rounded,
                  filled: _open,
                  busy: _busy && _open,
                  onPressed: connected && !_busy ? _sync : null,
                ),
              ),
            ],
          ),
          if (connected && _progress == null) ...[
            const SizedBox(height: 10),
            const Text(
              'Computer connected.',
              style: TextStyle(
                fontFamily: Lg.sans,
                fontSize: 12.5,
                color: Lg.emerald,
              ),
            ),
          ],
          if (_progress != null) ...[
            const SizedBox(height: 14),
            _SyncTrail(progress: _progress!),
          ],
          if (_status != null) ...[
            const SizedBox(height: 10),
            Text(
              _status!,
              style: const TextStyle(
                fontFamily: Lg.sans,
                fontSize: 13,
                height: 1.4,
                color: Lg.charcoal,
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(
                fontFamily: Lg.sans,
                fontSize: 13,
                color: Lg.coral,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SyncResultDialog extends StatelessWidget {
  const _SyncResultDialog({required this.report});

  final SyncOutcome report;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Lg.panel,
      insetPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 28),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 640),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 20, 22, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  LgEyebrow('Sync'),
                  SizedBox(height: 8),
                  Text(
                    'Goods updated',
                    style: TextStyle(
                      fontFamily: Lg.display,
                      fontSize: 26,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.4,
                      color: Lg.charcoal,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'The newer copy won on each side.',
                    style: TextStyle(
                      fontFamily: Lg.sans,
                      fontSize: 13.5,
                      height: 1.4,
                      color: Lg.muted,
                    ),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(22, 0, 22, 8),
                child: Column(
                  children: [
                    _ChangeSide(label: 'This phone', counts: report.took),
                    const SizedBox(height: 10),
                    _ChangeSide(label: 'The computer', counts: report.peer),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 8, 22, 18),
              child: SizedBox(
                width: double.infinity,
                child: LgButton(
                  label: 'Done',
                  onPressed: () => Navigator.pop(context),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChangeSide extends StatelessWidget {
  const _ChangeSide({required this.label, required this.counts});

  final String label;
  final SyncCounts counts;

  @override
  Widget build(BuildContext context) {
    final updated = [
      for (final change in counts.changes)
        if (change.action == 'updated') change.title,
    ];
    final added = [
      for (final change in counts.changes)
        if (change.action == 'added') change.title,
    ];
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xCCFFFFFF),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x66C19A55)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            LgEyebrow(label),
            const SizedBox(height: 8),
            _ChangeList(title: 'Updated', names: updated),
            const SizedBox(height: 10),
            _ChangeList(title: 'Added', names: added),
          ],
        ),
      ),
    );
  }
}

class _ChangeList extends StatelessWidget {
  const _ChangeList({required this.title, required this.names});

  final String title;
  final List<String> names;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$title  ${names.length}',
          style: const TextStyle(
            fontFamily: Lg.sans,
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: Lg.charcoal,
          ),
        ),
        const SizedBox(height: 4),
        if (names.isEmpty)
          const Text(
            'None',
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13,
              color: Lg.muted,
            ),
          )
        else
          for (final name in names)
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: Lg.display,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.2,
                  color: Lg.charcoal,
                ),
              ),
            ),
      ],
    );
  }
}

class _SyncAction extends StatelessWidget {
  const _SyncAction({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.filled = true,
    this.busy = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool filled;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;
    final foreground = filled ? const Color(0xFF7A5B1F) : Lg.goldDark;
    return SizedBox(
      height: 46,
      child: Material(
        color: filled
            ? (enabled || busy ? Lg.goldSoft : const Color(0xFFF6F1E6))
            : const Color(0xCCFFFFFF),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: filled ? Colors.transparent : const Color(0x66C19A55),
          ),
        ),
        child: InkWell(
          onTap: enabled ? onPressed : null,
          borderRadius: BorderRadius.circular(14),
          child: Opacity(
            opacity: enabled || busy ? 1 : 0.45,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Center(
                child: busy
                    ? SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: foreground,
                        ),
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(icon, size: 16, color: foreground),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontFamily: Lg.sans,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: foreground,
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SyncField extends StatelessWidget {
  const _SyncField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.enabled,
    this.digits = false,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final bool enabled;
  final bool digits;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      keyboardType: digits ? TextInputType.number : TextInputType.url,
      textInputAction: TextInputAction.done,
      autocorrect: false,
      enableSuggestions: false,
      maxLength: digits ? 4 : null,
      inputFormatters: digits
          ? [FilteringTextInputFormatter.digitsOnly]
          : const [],
      style: TextStyle(
        fontFamily: digits ? Lg.display : Lg.sans,
        fontSize: digits ? 20 : 16,
        fontWeight: FontWeight.w600,
        letterSpacing: digits ? 6 : 0,
        color: Lg.charcoal,
      ),
      cursorColor: Lg.goldDark,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        counterText: '',
        labelStyle: const TextStyle(
          fontFamily: Lg.sans,
          fontSize: 12,
          color: Lg.muted,
        ),
        hintStyle: const TextStyle(color: Lg.muted, fontFamily: Lg.sans),
        filled: true,
        fillColor: Lg.ivory,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Lg.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Lg.gold),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Lg.line),
        ),
      ),
    );
  }
}

class _SyncTrail extends StatelessWidget {
  const _SyncTrail({required this.progress});

  final SyncProgress progress;

  static const _phases = ['compare', 'send', 'receive', 'save'];
  static const _labels = ['Compare', 'Send', 'Receive', 'Save'];

  @override
  Widget build(BuildContext context) {
    final width = progress.value.clamp(0.06, 1.0);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFFFFCF8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x66C19A55)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Expanded(
                  child: Text(
                    progress.title,
                    style: const TextStyle(
                      fontFamily: Lg.display,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.2,
                      color: Lg.charcoal,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  progress.detail,
                  style: const TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 12,
                    color: Lg.muted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: SizedBox(
                height: 6,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const ColoredBox(color: Lg.ivoryDeep),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: width,
                        heightFactor: 1,
                        child: const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                Color(0xFFEFD59A),
                                Color(0xFFD4B06A),
                                Color(0xFFA8823D),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                for (var index = 0; index < _phases.length; index += 1)
                  Expanded(
                    child: Text(
                      _labels[index].toUpperCase(),
                      style: TextStyle(
                        fontFamily: Lg.sans,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.1,
                        color: _phases[index] == progress.phase
                            ? Lg.goldDark
                            : const Color(0xFFC4BBAE),
                      ),
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
                  onChanged: _busy ? null : _toggleFingerprint,
                ),
              ],
            ),
            if (!lock.biometricAvailable && !lock.biometricEnabled)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text(
                  'Uses the fingerprint saved in this phone’s settings.',
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
