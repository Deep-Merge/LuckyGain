import 'package:flutter/material.dart';

import '../theme/lg_colors.dart';
import '../widgets/lg_widgets.dart';
import 'app_lock.dart';

class LockScreen extends StatefulWidget {
  const LockScreen({super.key, required this.lock});

  final AppLock lock;

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  final _password = TextEditingController();
  var _busy = false;
  var _hidden = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.lock.biometricEnabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _fingerprint();
      });
    }
  }

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _unlock() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await widget.lock.unlockWithPassword(_password.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = ok ? null : 'That password does not match.';
    });
  }

  Future<void> _fingerprint() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await widget.lock.confirmFingerprint('Unlock LuckyGain');
    if (!mounted) return;
    if (ok) widget.lock.markUnlocked();
    if (!mounted) return;
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Material(
        color: Lg.ivory,
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFBF6EC), Lg.ivory],
            ),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(28, 36, 28, 24),
              child: Column(
                children: [
                  const Spacer(),
                  ClipOval(
                    child: Image.asset(
                      'assets/brand/icon.png',
                      width: 88,
                      height: 88,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'LuckyGain',
                    style: TextStyle(
                      fontFamily: Lg.display,
                      fontSize: 32,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.4,
                      color: Lg.charcoal,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Enter your password',
                    style: TextStyle(
                      fontFamily: Lg.sans,
                      fontSize: 13.5,
                      color: Lg.muted,
                    ),
                  ),
                  const SizedBox(height: 28),
                  LgSecretField(
                    controller: _password,
                    hidden: _hidden,
                    hint: 'Password',
                    onToggle: () => setState(() => _hidden = !_hidden),
                    onSubmit: _unlock,
                    autofocus: !widget.lock.biometricEnabled,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _error!,
                      style: const TextStyle(
                        fontFamily: Lg.sans,
                        fontSize: 13,
                        color: Lg.coral,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: LgButton(
                      label: 'Unlock',
                      busy: _busy,
                      onPressed: _unlock,
                    ),
                  ),
                  if (widget.lock.biometricEnabled) ...[
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: _busy ? null : _fingerprint,
                      icon: const Icon(Icons.fingerprint, color: Lg.goldDark),
                      label: const Text(
                        'Use fingerprint',
                        style: TextStyle(
                          fontFamily: Lg.sans,
                          fontWeight: FontWeight.w600,
                          color: Lg.goldDark,
                        ),
                      ),
                    ),
                  ],
                  const Spacer(flex: 2),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class LgSecretField extends StatelessWidget {
  const LgSecretField({
    super.key,
    required this.controller,
    required this.hidden,
    required this.hint,
    required this.onToggle,
    this.onSubmit,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final bool hidden;
  final String hint;
  final VoidCallback onToggle;
  final VoidCallback? onSubmit;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: hidden,
      autofocus: autofocus,
      autocorrect: false,
      enableSuggestions: false,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => onSubmit?.call(),
      style: const TextStyle(
        fontFamily: Lg.sans,
        fontSize: 15,
        color: Lg.charcoal,
      ),
      cursorColor: Lg.goldDark,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Lg.muted, fontFamily: Lg.sans),
        filled: true,
        fillColor: Lg.panel,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        suffixIcon: IconButton(
          onPressed: onToggle,
          icon: Icon(
            hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
            color: Lg.muted,
            size: 20,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Lg.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Lg.gold),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Lg.line),
        ),
      ),
    );
  }
}
