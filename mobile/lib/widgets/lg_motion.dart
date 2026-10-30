import 'package:flutter/material.dart';

const lgMove = Duration(milliseconds: 380);
const lgSettle = Duration(milliseconds: 280);

const _ease = Curves.easeOutCubic;
const _easeBack = Curves.easeInCubic;

/// Quiet fade and a short slide for every pushed screen.
class LgPageTransitionsBuilder extends PageTransitionsBuilder {
  const LgPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final enter = CurvedAnimation(
      parent: animation,
      curve: _ease,
      reverseCurve: _easeBack,
    );
    final leave = CurvedAnimation(
      parent: secondaryAnimation,
      curve: _ease,
      reverseCurve: _easeBack,
    );
    return FadeTransition(
      opacity: Tween<double>(begin: 1, end: 0.94).animate(leave),
      child: SlideTransition(
        position: Tween<Offset>(
          begin: Offset.zero,
          end: const Offset(-0.04, 0),
        ).animate(leave),
        child: FadeTransition(
          opacity: enter,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.06, 0),
              end: Offset.zero,
            ).animate(enter),
            child: child,
          ),
        ),
      ),
    );
  }
}

class LgPageRoute<T> extends MaterialPageRoute<T> {
  LgPageRoute({required super.builder});

  @override
  Duration get transitionDuration => lgMove;

  @override
  Duration get reverseTransitionDuration => lgSettle;
}

/// Keeps every tab alive, slides to the chosen one, and follows a sideways drag.
class LgTabStage extends StatefulWidget {
  const LgTabStage({
    super.key,
    required this.index,
    required this.onIndexChanged,
    required this.onVisual,
    required this.children,
  });

  final int index;
  final ValueChanged<int> onIndexChanged;
  final ValueChanged<double> onVisual;
  final List<Widget> children;

  @override
  State<LgTabStage> createState() => _LgTabStageState();
}

class _LgTabStageState extends State<LgTabStage> with TickerProviderStateMixin {
  late final AnimationController _motion;
  late final AnimationController _spring;

  var _settled = 0;
  int? _incoming;
  var _drag = 0.0;
  var _springFrom = 0.0;
  var _width = 1.0;
  var _reduceMotion = false;

  @override
  void initState() {
    super.initState();
    _settled = widget.index;
    _motion = AnimationController(vsync: this, duration: lgMove)
      ..addListener(_onMotion)
      ..addStatusListener(_onMotionStatus);
    _spring = AnimationController(vsync: this, duration: lgSettle)
      ..addListener(_onSpring);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.disableAnimationsOf(context);
  }

  @override
  void didUpdateWidget(LgTabStage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.index != oldWidget.index && widget.index != _incoming) {
      _drag = 0;
      _spring.stop();
      final next = widget.index;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _animateTo(next);
      });
    }
  }

  @override
  void dispose() {
    _motion.dispose();
    _spring.dispose();
    super.dispose();
  }

  void _onMotion() {
    final incoming = _incoming;
    if (incoming == null || !mounted) return;
    setState(() {});
    widget.onVisual(_settled + (incoming - _settled) * _motion.value);
  }

  void _onMotionStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || _incoming == null || !mounted) {
      return;
    }
    final dest = _incoming!;
    setState(() {
      _settled = dest;
      _incoming = null;
    });
    widget.onVisual(dest.toDouble());
  }

  void _onSpring() {
    setState(() => _drag = _springFrom * (1 - _spring.value));
    widget.onVisual(_settled - _drag / _width);
  }

  void _animateTo(int next) {
    if (next == _incoming) return;
    if (_incoming != null) {
      _motion.stop();
      _settled = _motion.value >= 0.5 ? _incoming! : _settled;
      _incoming = null;
      _motion.value = 0;
    }
    if (next == _settled || next < 0 || next >= widget.children.length) {
      widget.onVisual(_settled.toDouble());
      return;
    }
    if (_reduceMotion) {
      setState(() => _settled = next);
      widget.onVisual(next.toDouble());
      return;
    }
    setState(() => _incoming = next);
    _motion.forward(from: 0);
  }

  void _onDrag(double delta) {
    if (_incoming != null) return;
    _spring.stop();
    var next = _drag + delta;
    final atStart = _settled == 0 && next > 0;
    final atEnd = _settled == widget.children.length - 1 && next < 0;
    if (atStart || atEnd) next = _drag + delta * 0.28;
    setState(() => _drag = next);
    widget.onVisual(_settled - _drag / _width);
  }

  void _endDrag(double velocity) {
    if (_incoming != null) return;
    final progress = -_drag / _width;
    final flickNext = velocity < -900;
    final flickPrev = velocity > 900;
    final goNext =
        _settled < widget.children.length - 1 &&
        (flickNext || (progress > 0.22 && !flickPrev));
    final goPrev =
        _settled > 0 && (flickPrev || (progress < -0.22 && !flickNext));
    if (goNext || goPrev) {
      final dest = goNext ? _settled + 1 : _settled - 1;
      final traveled = (goNext ? progress : -progress).clamp(0.0, 1.0);
      setState(() {
        _drag = 0;
        _incoming = dest;
      });
      widget.onIndexChanged(dest);
      final remain = (1 - traveled).clamp(0.05, 1.0);
      _motion.value = traveled;
      _motion.animateTo(
        1,
        duration: Duration(
          milliseconds: (lgMove.inMilliseconds * remain).round(),
        ),
        curve: _ease,
      );
      return;
    }
    _springFrom = _drag;
    _spring.forward(from: 0);
  }

  Offset _offsetFor(int index) {
    final width = _width;
    final incoming = _incoming;
    if (incoming != null) {
      final t = _motion.value;
      final dir = incoming > _settled ? 1.0 : -1.0;
      if (index == _settled) return Offset(-dir * width * t, 0);
      if (index == incoming) return Offset(dir * width * (1 - t), 0);
    }
    if (_drag != 0) {
      if (index == _settled) return Offset(_drag, 0);
      if (index == _settled + 1 && _drag < 0) return Offset(width + _drag, 0);
      if (index == _settled - 1 && _drag > 0) return Offset(-width + _drag, 0);
    }
    return Offset.zero;
  }

  bool _shown(int index) {
    if (index == _settled || index == _incoming) return true;
    if (_drag < 0 && index == _settled + 1) return true;
    if (_drag > 0 && index == _settled - 1) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        _width = constraints.maxWidth <= 0 ? 1 : constraints.maxWidth;
        final moving = _incoming != null || _drag != 0;
        return GestureDetector(
          onHorizontalDragUpdate: (details) => _onDrag(details.delta.dx),
          onHorizontalDragEnd: (details) =>
              _endDrag(details.velocity.pixelsPerSecond.dx),
          child: ClipRect(
            child: Stack(
              fit: StackFit.expand,
              children: [
                for (var i = 0; i < widget.children.length; i++)
                  Offstage(
                    key: ValueKey('tab-$i'),
                    offstage: !_shown(i),
                    child: TickerMode(
                      enabled: _shown(i),
                      child: IgnorePointer(
                        ignoring: moving || i != _settled,
                        child: Transform.translate(
                          offset: _offsetFor(i),
                          child: RepaintBoundary(child: widget.children[i]),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}
