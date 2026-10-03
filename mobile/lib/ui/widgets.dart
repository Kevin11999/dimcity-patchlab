import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import 'theme.dart';

class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.mono = false});
  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 132, child: Text(label, style: style?.copyWith(color: Pal.muted))),
          Expanded(child: SelectableText(value, style: mono ? style?.copyWith(fontFamily: 'monospace', fontSize: 13) : style)),
        ],
      ),
    );
  }
}

/// A small pill label.
class Badge2 extends StatelessWidget {
  const Badge2(this.text, {super.key, this.color, this.icon, this.foreground});
  final String text;
  final Color? color;
  final Color? foreground;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final bg = color ?? Pal.cardHigh;
    final fg = foreground ?? Pal.text;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 4)],
          Text(text, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: fg, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class NoticeCard extends StatelessWidget {
  const NoticeCard(this.text, {super.key, this.icon = Icons.info_outline, this.color, this.iconColor, this.action});
  final String text;
  final IconData icon;
  final Color? color;
  final Color? iconColor;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color ?? Pal.card,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: iconColor ?? Pal.muted),
            const SizedBox(width: 12),
            Expanded(child: Padding(padding: const EdgeInsets.only(top: 1), child: Text(text))),
            ?action,
          ],
        ),
      ),
    );
  }
}

class WarningCard extends StatelessWidget {
  const WarningCard(this.text, {super.key, this.action});
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) => NoticeCard(
        text,
        icon: Icons.warning_amber_rounded,
        iconColor: Pal.red,
        color: Theme.of(context).colorScheme.errorContainer,
        action: action,
      );
}

class SuccessCard extends StatelessWidget {
  const SuccessCard(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) =>
      NoticeCard(text, icon: Icons.check_circle, iconColor: Pal.green, color: Theme.of(context).colorScheme.secondaryContainer);
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
        child: Row(
          children: [
            Expanded(child: Text(text.toUpperCase(), style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Pal.muted, letterSpacing: 1.2, fontWeight: FontWeight.w700))),
            ?trailing,
          ],
        ),
      );
}

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}

Future<bool> confirm(BuildContext context, {required String title, required String body, String? okLabel, bool destructive = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(t('common.cancel'))),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(okLabel ?? t('common.ok')),
        ),
      ],
    ),
  );
  return r ?? false;
}

Future<String?> promptText(BuildContext context, {required String title, String? hint, String initial = '', int? maxLength, TextInputType? keyboard}) async {
  final controller = TextEditingController(text: initial);
  final r = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        maxLength: maxLength,
        keyboardType: keyboard,
        decoration: InputDecoration(hintText: hint),
        onSubmitted: (v) => Navigator.pop(ctx, v),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(t('common.cancel'))),
        FilledButton(onPressed: () => Navigator.pop(ctx, controller.text), child: Text(t('common.ok'))),
      ],
    ),
  );
  controller.dispose();
  return r;
}

/// A blinking lamp icon for the fixture that is identifying.
class BlinkIcon extends StatefulWidget {
  const BlinkIcon({super.key, this.size = 48, this.color});
  final double size;
  final Color? color;

  @override
  State<BlinkIcon> createState() => _BlinkIconState();
}

class _BlinkIconState extends State<BlinkIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 550))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween<double>(begin: 0.25, end: 1).animate(_c),
        child: Icon(Icons.lightbulb, size: widget.size, color: widget.color ?? Pal.amber),
      );
}

/// Expanding rings behind [child]: "something is happening".
class PulseRings extends StatefulWidget {
  const PulseRings({super.key, required this.child, this.color = Pal.amber, this.size = 150});
  final Widget child;
  final Color color;
  final double size;

  @override
  State<PulseRings> createState() => _PulseRingsState();
}

class _PulseRingsState extends State<PulseRings> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: widget.size,
        height: widget.size,
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, child) => CustomPaint(
            painter: _RingsPainter(_c.value, widget.color),
            child: Center(child: child),
          ),
          child: widget.child,
        ),
      );
}

class _RingsPainter extends CustomPainter {
  _RingsPainter(this.t, this.color);
  final double t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final maxR = size.width / 2;
    for (var i = 0; i < 3; i++) {
      final p = (t + i / 3) % 1.0;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = color.withValues(alpha: (1 - p) * 0.5);
      canvas.drawCircle(c, maxR * (0.35 + 0.65 * p), paint);
    }
  }

  @override
  bool shouldRepaint(_RingsPainter old) => old.t != t || old.color != color;
}

/// Big centred message for empty and busy states.
class StateHero extends StatelessWidget {
  const StateHero({super.key, required this.icon, required this.title, this.body, this.color = Pal.amber, this.pulse = false, this.children = const []});
  final IconData icon;
  final String title;
  final String? body;
  final Color color;
  final bool pulse;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final glyph = Container(
      width: 84,
      height: 84,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.14), border: Border.all(color: color.withValues(alpha: 0.5), width: 1.5)),
      child: Icon(icon, size: 40, color: color),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 32, 28, 16),
      child: Column(
        children: [
          pulse ? PulseRings(color: color, child: glyph) : glyph,
          const SizedBox(height: 22),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
          if (body != null) ...[
            const SizedBox(height: 10),
            Text(body!, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Pal.muted, height: 1.4)),
          ],
          ...children,
        ],
      ),
    );
  }
}

/// The four steps of addressing, shown under the app bar of every wizard screen.
class StepHeader extends StatelessWidget implements PreferredSizeWidget {
  const StepHeader(this.current, {super.key});

  /// 0 Align, 1 Modes, 2 Addresses, 3 Send.
  final int current;

  @override
  Size get preferredSize => const Size.fromHeight(58);

  @override
  Widget build(BuildContext context) {
    final labels = [t('steps.align'), t('steps.modes'), t('steps.addresses'), t('steps.send')];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++) ...[
            Expanded(flex: i == current ? 4 : 1, child: _step(context, i, labels[i])),
            if (i < labels.length - 1) Container(width: 10, height: 2, color: i < current ? Pal.amber : Pal.line),
          ],
        ],
      ),
    );
  }

  Widget _step(BuildContext context, int i, String label) {
    final done = i < current;
    final active = i == current;
    final color = active ? Pal.amber : (done ? Pal.teal : Pal.muted);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active ? Pal.amber : (done ? Pal.teal.withValues(alpha: 0.2) : Colors.transparent),
            border: Border.all(color: color, width: 1.5),
          ),
          child: done
              ? const Icon(Icons.check, size: 13, color: Pal.teal)
              : Text('${i + 1}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: active ? const Color(0xFF241800) : color)),
        ),
        // Only the current step shows its name; the others are just a number or a tick.
        if (active) ...[
          const SizedBox(width: 8),
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: color, fontWeight: FontWeight.w800))),
        ],
      ],
    );
  }
}

/// "A 025": the DMX start address as a badge in the colour of the fixture type.
class AddressBadge extends StatelessWidget {
  const AddressBadge(this.address, {super.key, required this.color, this.big = false, this.dim = false});
  final int? address;
  final Color color;
  final bool big;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    final text = address == null ? '–' : address.toString().padLeft(3, '0');
    final c = dim ? Pal.muted : color;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: big ? 14 : 10, vertical: big ? 8 : 5),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12), border: Border.all(color: c.withValues(alpha: 0.55))),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text('A', style: TextStyle(fontSize: big ? 13 : 11, color: c.withValues(alpha: 0.8), fontWeight: FontWeight.w700)),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(fontSize: big ? 26 : 18, fontWeight: FontWeight.w800, color: c, fontFeatures: const [FontFeature.tabularFigures()])),
        ],
      ),
    );
  }
}

class UniverseSegment {
  const UniverseSegment({required this.start, required this.end, required this.color, this.label = ''});
  final int start;
  final int end;
  final Color color;
  final String label;
}

/// All 512 channels of a universe as a bar, with the fixtures as coloured blocks.
class UniverseBar extends StatelessWidget {
  const UniverseBar({super.key, required this.segments, this.height = 30});
  final List<UniverseSegment> segments;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height + 16,
        child: CustomPaint(painter: _UniversePainter(segments, height), size: Size.infinite),
      );
}

class _UniversePainter extends CustomPainter {
  _UniversePainter(this.segments, this.barHeight);
  final List<UniverseSegment> segments;
  final double barHeight;

  @override
  void paint(Canvas canvas, Size size) {
    final track = RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, size.width, barHeight), const Radius.circular(8));
    canvas.drawRRect(track, Paint()..color = Pal.surface);
    canvas.save();
    canvas.clipRRect(track);
    for (final s in segments) {
      final x0 = (s.start - 1) / 512 * size.width;
      final x1 = s.end / 512 * size.width;
      final r = Rect.fromLTRB(x0 + 0.5, 1, math.max(x0 + 2, x1 - 0.5), barHeight - 1);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(5)), Paint()..color = s.color.withValues(alpha: 0.9));
    }
    canvas.restore();
    canvas.drawRRect(track, Paint()
      ..style = PaintingStyle.stroke
      ..color = Pal.line);
    // Ticks at 1, 128, 256, 384, 512.
    final tick = Paint()..color = Pal.muted.withValues(alpha: 0.6);
    for (final v in const [1, 128, 256, 384, 512]) {
      final x = (v - 1) / 511 * size.width;
      canvas.drawLine(Offset(x, barHeight + 2), Offset(x, barHeight + 6), tick);
      final tp = TextPainter(
        text: TextSpan(text: '$v', style: const TextStyle(fontSize: 9, color: Pal.muted)),
        textDirection: TextDirection.ltr,
      )..layout();
      final dx = v == 1 ? 0.0 : (v == 512 ? size.width - tp.width : x - tp.width / 2);
      tp.paint(canvas, Offset(dx, barHeight + 6));
    }
  }

  @override
  bool shouldRepaint(_UniversePainter old) => old.segments != segments || old.barHeight != barHeight;
}

/// Round avatar with a lamp icon in the fixture type colour; blinks while identifying.
class LampAvatar extends StatelessWidget {
  const LampAvatar({super.key, required this.color, this.identifying = false, this.dim = false, this.size = 44});
  final Color color;
  final bool identifying;
  final bool dim;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = dim ? Pal.muted : color;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: c.withValues(alpha: 0.16), border: Border.all(color: c.withValues(alpha: 0.6))),
      child: identifying ? Center(child: BlinkIcon(size: size * 0.55, color: c)) : Icon(Icons.lightbulb_outline, size: size * 0.52, color: c),
    );
  }
}

String describeError(Object e) {
  final s = e.toString();
  return s.replaceFirst('Exception: ', '');
}
