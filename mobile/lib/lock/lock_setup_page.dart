import 'package:flutter/material.dart';

import '../theme/lg_colors.dart';
import '../widgets/lg_widgets.dart';
import 'app_lock.dart';
import 'lock_screen.dart';

enum LockSetupKind { create, change, remove }

class LockSetupPage extends StatefulWidget {
  const LockSetupPage({super.key, required this.lock, required this.kind});

  final AppLock lock;
  final LockSetupKind kind;

  @override
  State<LockSetupPage> createState() => _LockSetupPageState();
}

class _LockSetupPageState extends State<LockSetupPage> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  var _hidden = true;
  var _busy = false;
  String? _error;

  bool get _needsCurrent => widget.kind != LockSetupKind.create;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String get _title => switch (widget.kind) {
    LockSetupKind.create => 'Set a password',
    LockSetupKind.change => 'Change password',
    LockSetupKind.remove => 'Remove password',
  };

  String get _action => switch (widget.kind) {
    LockSetupKind.create => 'Save password',
    LockSetupKind.change => 'Save password',
    LockSetupKind.remove => 'Remove password',
  };

  Future<void> _submit() async {
    if (_busy) return;
    final current = _current.text;
    final next = _next.text;
    if (widget.kind != LockSetupKind.remove) {
      if (next.length < 4) {
        setState(() => _error = 'Use at least 4 characters.');
        return;
      }
      if (next != _confirm.text) {
        setState(() => _error = 'Those passwords do not match.');
        return;
      }
    } else if (current.isEmpty) {
      setState(() => _error = 'Enter your current password.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    var ok = false;
    switch (widget.kind) {
      case LockSetupKind.create:
        await widget.lock.setPassword(next);
        ok = true;
      case LockSetupKind.change:
        ok = await widget.lock.changePassword(current, next);
      case LockSetupKind.remove:
        ok = await widget.lock.clearPassword(current);
    }

    if (!mounted) return;
    if (!ok) {
      setState(() {
        _busy = false;
        _error = 'That password does not match.';
      });
      return;
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Lg.ivory,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFBF6EC), Lg.ivory],
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back, color: Lg.charcoal),
                ),
              ),
              const LgEyebrow('This phone'),
              const SizedBox(height: 6),
              LgTitle(_title),
              const SizedBox(height: 8),
              Text(
                widget.kind == LockSetupKind.remove
                    ? 'The ledger stays on this phone. Only the lock is removed.'
                    : 'This password stays on the phone. It is not written into the ledger backup.',
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 13.5,
                  height: 1.45,
                  color: Lg.muted,
                ),
              ),
              const SizedBox(height: 22),
              if (_needsCurrent) ...[
                LgSecretField(
                  controller: _current,
                  hidden: _hidden,
                  hint: 'Current password',
                  autofocus: true,
                  onToggle: () => setState(() => _hidden = !_hidden),
                ),
                const SizedBox(height: 10),
              ],
              if (widget.kind != LockSetupKind.remove) ...[
                LgSecretField(
                  controller: _next,
                  hidden: _hidden,
                  hint: 'New password',
                  autofocus: !_needsCurrent,
                  onToggle: () => setState(() => _hidden = !_hidden),
                ),
                const SizedBox(height: 10),
                LgSecretField(
                  controller: _confirm,
                  hidden: _hidden,
                  hint: 'Confirm password',
                  onToggle: () => setState(() => _hidden = !_hidden),
                  onSubmit: _submit,
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 13,
                    color: Lg.coral,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              LgButton(label: _action, busy: _busy, onPressed: _submit),
            ],
          ),
        ),
      ),
    );
  }
}
