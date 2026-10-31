import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../db/ledger_store.dart';
import '../lock/app_lock.dart';
import '../pages/goods_page.dart';
import '../pages/home_page.dart';
import '../pages/ledger_page.dart';
import '../theme/lg_colors.dart';
import '../widgets/lg_motion.dart';
import '../widgets/lg_widgets.dart';

class LedgerShell extends StatefulWidget {
  const LedgerShell({super.key, required this.store, required this.lock});

  final LedgerStore store;
  final AppLock lock;

  @override
  State<LedgerShell> createState() => _LedgerShellState();
}

class _LedgerShellState extends State<LedgerShell> {
  var _index = 1;
  var _visual = 1.0;
  var _busy = false;
  String? _notice;
  String? _error;

  LedgerStore get store => widget.store;

  @override
  void initState() {
    super.initState();
    store.addListener(_onStore);
  }

  @override
  void dispose() {
    store.removeListener(_onStore);
    super.dispose();
  }

  void _onStore() {
    if (mounted) setState(() {});
  }

  void _go(int index) {
    if (index == _index) return;
    setState(() => _index = index);
  }

  void _onVisual(double value) {
    if (!mounted || (value - _visual).abs() < 0.001) return;
    setState(() => _visual = value);
  }

  Future<void> _restore() async {
    widget.lock.suppressLock = true;
    late final List<PlatformFile> picked;
    try {
      picked = await FilePicker.pickFiles(type: FileType.any);
    } finally {
      widget.lock.suppressLock = false;
    }
    if (picked.isEmpty || !mounted) return;
    final file = picked.first;
    if (store.snapshot.hasActivity) {
      final ok = await lgConfirm(
        context,
        title: 'Replace this ledger?',
        body:
            '“${file.name}” will replace the data on this phone. This cannot be undone.',
        confirm: 'Restore',
      );
      if (!ok || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final bytes = await file.readAsBytes();
      await store.restore(bytes);
      if (!mounted) return;
      setState(() {
        _notice = store.notice;
        _index = 1;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is FormatException
            ? error.message
            : 'Could not restore that backup.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _export() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final file = await store.exportFile();
      final name = file.uri.pathSegments.last;
      await const MethodChannel('luckygain/files').invokeMethod<String>(
        'saveDownloads',
        {'name': name, 'path': file.path},
      );
      if (!mounted) return;
      setState(() => _notice = 'Saved in Downloads · $name');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is PlatformException && (error.message ?? '').isNotEmpty
            ? error.message!
            : 'Could not save the backup.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = store.snapshot;
    final pages = [
      HomePage(snapshot: snapshot, onOpenLedger: () => _go(2)),
      GoodsPage(store: store, lock: widget.lock),
      LedgerPage(
        store: store,
        lock: widget.lock,
        busy: _busy,
        notice: _notice,
        error: _error,
        onRestore: _restore,
        onExport: _export,
      ),
    ];
    final index = _index.clamp(0, pages.length - 1);
    final visual = _index == index ? _visual : index.toDouble();
    if (_index != index) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() {
          _index = index;
          _visual = index.toDouble();
        });
      });
    }

    return Scaffold(
      backgroundColor: Lg.ivory,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFBF6EC), Lg.ivory, Lg.ivory],
            stops: [0, 0.28, 1],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: Row(
                  children: [
                    ClipOval(
                      child: Image.asset(
                        'assets/brand/icon.png',
                        width: 42,
                        height: 42,
                        fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'LuckyGain',
                          style: TextStyle(
                            fontFamily: Lg.display,
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.3,
                            color: Lg.charcoal,
                          ),
                        ),
                        SizedBox(height: 1),
                        Text(
                          'LOCAL LEDGER',
                          style: TextStyle(
                            fontFamily: Lg.sans,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.6,
                            color: Lg.gold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Expanded(
                child: LgTabStage(
                  index: index,
                  onIndexChanged: _go,
                  onVisual: _onVisual,
                  children: pages,
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _NavBar(visual: visual, onSelect: _go),
    );
  }
}

class _NavBar extends StatelessWidget {
  const _NavBar({required this.visual, required this.onSelect});

  final double visual;
  final ValueChanged<int> onSelect;

  static const _items = [
    (Icons.space_dashboard_outlined, Icons.space_dashboard, 'Home'),
    (Icons.shopping_bag_outlined, Icons.shopping_bag, 'Goods'),
    (
      Icons.account_balance_wallet_outlined,
      Icons.account_balance_wallet,
      'Ledger',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Color(0xFFF7F1E6),
        border: Border(top: BorderSide(color: Color(0x33C19A55))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final tab = constraints.maxWidth / _items.length;
              final left = visual * tab + (tab - 22) / 2;
              return Stack(
                children: [
                  Positioned(
                    top: 0,
                    left: left,
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        color: Lg.gold,
                        borderRadius: BorderRadius.all(Radius.circular(2)),
                      ),
                      child: SizedBox(width: 22, height: 2),
                    ),
                  ),
                  Row(
                    children: [
                      for (var i = 0; i < _items.length; i++)
                        Expanded(
                          child: _NavItem(
                            label: _items[i].$3,
                            icon: _items[i].$1,
                            selectedIcon: _items[i].$2,
                            emphasis: (1 - (visual - i).abs()).clamp(0.0, 1.0),
                            onTap: () => onSelect(i),
                          ),
                        ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.emphasis,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final double emphasis;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = Color.lerp(Lg.muted, Lg.goldDark, emphasis)!;
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Transform.scale(
            scale: 1 + 0.05 * emphasis,
            child: Icon(
              emphasis > 0.55 ? selectedIcon : icon,
              size: 20,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 10,
              fontWeight: emphasis > 0.55 ? FontWeight.w600 : FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

ThemeData luckygainTheme() {
  const scheme = ColorScheme.light(
    primary: Lg.goldDark,
    onPrimary: Color(0xFF7A5B1F),
    surface: Lg.panel,
    onSurface: Lg.charcoal,
  );
  const transitions = PageTransitionsTheme(
    builders: {
      TargetPlatform.android: LgPageTransitionsBuilder(),
      TargetPlatform.iOS: LgPageTransitionsBuilder(),
      TargetPlatform.macOS: LgPageTransitionsBuilder(),
      TargetPlatform.windows: LgPageTransitionsBuilder(),
      TargetPlatform.linux: LgPageTransitionsBuilder(),
      TargetPlatform.fuchsia: LgPageTransitionsBuilder(),
    },
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: scheme,
    scaffoldBackgroundColor: Lg.ivory,
    fontFamily: Lg.sans,
    splashColor: const Color(0x14C19A55),
    highlightColor: const Color(0x10C19A55),
    pageTransitionsTheme: transitions,
  );
}

void paintSystemUi() {
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Color(0xFFF7F1E6),
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );
}
