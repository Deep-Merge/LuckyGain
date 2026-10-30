import 'package:flutter/material.dart';

import '../theme/lg_colors.dart';

class LgCard extends StatelessWidget {
  const LgCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Lg.panel,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Lg.line),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A2A2F2B),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: padding ?? const EdgeInsets.fromLTRB(18, 16, 18, 16),
        child: child,
      ),
    );
  }
}

class LgEyebrow extends StatelessWidget {
  const LgEyebrow(this.text, {super.key, this.color = Lg.goldDark});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontFamily: Lg.sans,
        fontSize: 10,
        fontWeight: FontWeight.w600,
        letterSpacing: 1.4,
        color: color,
      ),
    );
  }
}

class LgTitle extends StatelessWidget {
  const LgTitle(this.text, {super.key, this.size = 28});

  final String text;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontFamily: Lg.display,
        fontSize: size,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.4,
        height: 1.15,
        color: Lg.charcoal,
      ),
    );
  }
}

class LgButton extends StatelessWidget {
  const LgButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.filled = true,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool filled;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final child = busy
        ? const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: Lg.goldDark,
            ),
          )
        : Text(label);
    final style = ButtonStyle(
      elevation: const WidgetStatePropertyAll(0),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      ),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      textStyle: const WidgetStatePropertyAll(
        TextStyle(
          fontFamily: Lg.sans,
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
    if (!filled) {
      return OutlinedButton(
        onPressed: busy ? null : onPressed,
        style: style.copyWith(
          foregroundColor: const WidgetStatePropertyAll(Lg.goldDark),
          side: const WidgetStatePropertyAll(
            BorderSide(color: Color(0x66C19A55)),
          ),
          backgroundColor: const WidgetStatePropertyAll(Color(0xCCFFFFFF)),
        ),
        child: child,
      );
    }
    return FilledButton(
      onPressed: busy ? null : onPressed,
      style: style.copyWith(
        foregroundColor: const WidgetStatePropertyAll(Color(0xFF7A5B1F)),
        backgroundColor: const WidgetStatePropertyAll(Lg.goldSoft),
      ),
      child: child,
    );
  }
}

Future<bool> lgConfirm(
  BuildContext context, {
  required String title,
  required String body,
  required String confirm,
}) {
  return showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Dismiss',
    barrierColor: const Color(0x662A2F2B),
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (context, animation, secondary) {
      return Dialog(
        backgroundColor: Lg.panel,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 22, 22, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
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
              const SizedBox(height: 8),
              Text(
                body,
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 13.5,
                  height: 1.45,
                  color: Lg.muted,
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: LgButton(
                      label: 'Cancel',
                      filled: false,
                      onPressed: () => Navigator.pop(context, false),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: LgButton(
                      label: confirm,
                      onPressed: () => Navigator.pop(context, true),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
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
  ).then((value) => value ?? false);
}
