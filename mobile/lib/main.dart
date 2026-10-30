import 'package:flutter/material.dart';

import 'db/ledger_store.dart';
import 'lock/app_lock.dart';
import 'lock/lock_screen.dart';
import 'shell/app_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  paintSystemUi();
  final store = LedgerStore();
  final lock = AppLock();
  try {
    await store.open();
    await lock.load();
    runApp(LuckyGainApp(store: store, lock: lock));
  } catch (error) {
    runApp(LedgerBootError(message: '$error'));
  }
}

class LuckyGainApp extends StatelessWidget {
  const LuckyGainApp({super.key, required this.store, required this.lock});

  final LedgerStore store;
  final AppLock lock;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LuckyGain',
      debugShowCheckedModeBanner: false,
      theme: luckygainTheme(),
      home: AppGate(
        key: const ValueKey('app-gate'),
        store: store,
        lock: lock,
      ),
    );
  }
}

class AppGate extends StatefulWidget {
  const AppGate({super.key, required this.store, required this.lock});

  final LedgerStore store;
  final AppLock lock;

  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  AnimationController? _lockFade;
  var _lockGeneration = 0;

  AnimationController get _fade => _lockFade ??= _createFade();

  AnimationController _createFade() {
    return AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
      value: widget.lock.unlocked ? 0 : 1,
    )..addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void initState() {
    super.initState();
    _fade;
    WidgetsBinding.instance.addObserver(this);
    widget.lock.addListener(_onLock);
  }

  @override
  void reassemble() {
    super.reassemble();
    _fade;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.lock.removeListener(_onLock);
    _lockFade?.dispose();
    super.dispose();
  }

  void _onLock() {
    if (!mounted) return;
    if (widget.lock.unlocked) {
      _fade.reverse();
      return;
    }
    setState(() => _lockGeneration++);
    _fade.forward();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) widget.lock.lock();
  }

  @override
  Widget build(BuildContext context) {
    final fade = _fade;
    final covered = !widget.lock.unlocked || fade.value > 0;
    return Stack(
      children: [
        ExcludeSemantics(
          excluding: covered,
          child: IgnorePointer(
            ignoring: covered,
            child: LedgerShell(store: widget.store, lock: widget.lock),
          ),
        ),
        if (covered)
          Positioned.fill(
            child: IgnorePointer(
              ignoring: widget.lock.unlocked,
              child: Opacity(
                opacity: fade.value,
                child: Transform.scale(
                  scale: 0.985 + 0.015 * fade.value,
                  child: LockScreen(
                    key: ValueKey(_lockGeneration),
                    lock: widget.lock,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class LedgerBootError extends StatelessWidget {
  const LedgerBootError({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFFFBF8F2),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              message,
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
          ),
        ),
      ),
    );
  }
}
