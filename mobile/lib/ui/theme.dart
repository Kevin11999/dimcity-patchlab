import 'package:flutter/material.dart';

/// Colours of the app: a dark stage-console look (used on site, often in the dark) with
/// amber as the action colour and teal as the "all good" colour.
class Pal {
  Pal._();

  static const bg = Color(0xFF0A0E13);
  static const surface = Color(0xFF111821);
  static const card = Color(0xFF172030);
  static const cardHigh = Color(0xFF1F2B3F);
  static const line = Color(0xFF2A384E);
  static const text = Color(0xFFE9EEF5);
  static const muted = Color(0xFF8D9BB0);
  static const amber = Color(0xFFFFB224);
  static const teal = Color(0xFF2DD4BF);
  static const red = Color(0xFFFF6B7A);
  static const green = Color(0xFF3DDC97);

  /// One colour per fixture type, assigned in order of appearance.
  static const typeColors = <Color>[
    Color(0xFF2DD4BF),
    Color(0xFFFFB224),
    Color(0xFF60A5FA),
    Color(0xFFC084FC),
    Color(0xFFF472B6),
    Color(0xFF4ADE80),
    Color(0xFFFB923C),
    Color(0xFF22D3EE),
  ];

  static Color typeColor(int index) => typeColors[index % typeColors.length];
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: Pal.amber, brightness: Brightness.dark).copyWith(
    surface: Pal.bg,
    onSurface: Pal.text,
    onSurfaceVariant: Pal.muted,
    primary: Pal.amber,
    onPrimary: const Color(0xFF241800),
    primaryContainer: const Color(0xFF3A2A06),
    onPrimaryContainer: const Color(0xFFFFE1A6),
    secondary: Pal.teal,
    onSecondary: const Color(0xFF00201C),
    secondaryContainer: const Color(0xFF123530),
    onSecondaryContainer: const Color(0xFFB6F2EA),
    error: Pal.red,
    onError: const Color(0xFF2A0509),
    errorContainer: const Color(0xFF3B1820),
    onErrorContainer: const Color(0xFFFFC9D0),
    outline: Pal.line,
    outlineVariant: Pal.line,
    surfaceContainerLowest: Pal.bg,
    surfaceContainerLow: Pal.surface,
    surfaceContainer: Pal.card,
    surfaceContainerHigh: Pal.cardHigh,
    surfaceContainerHighest: Pal.cardHigh,
  );

  final base = ThemeData(brightness: Brightness.dark, useMaterial3: true);
  final text = base.textTheme
      .apply(bodyColor: Pal.text, displayColor: Pal.text)
      .copyWith(
        headlineSmall: base.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3, color: Pal.text),
        titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.2, color: Pal.text),
        titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: Pal.text),
        titleSmall: base.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600, color: Pal.text),
        labelLarge: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      );

  final shape14 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: Pal.bg,
    canvasColor: Pal.bg,
    textTheme: text,
    visualDensity: VisualDensity.standard,
    dividerTheme: const DividerThemeData(color: Pal.line, space: 1, thickness: 1),
    appBarTheme: AppBarTheme(
      backgroundColor: Pal.bg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge,
      foregroundColor: Pal.text,
    ),
    cardTheme: CardThemeData(
      color: Pal.card,
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Pal.line)),
    ),
    listTileTheme: const ListTileThemeData(iconColor: Pal.muted, contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Pal.surface,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.amber, width: 1.6)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(0, 52), shape: shape14, textStyle: text.labelLarge?.copyWith(fontSize: 15)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 52), shape: shape14, side: const BorderSide(color: Pal.line), foregroundColor: Pal.text),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(shape: shape14)),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        side: const BorderSide(color: Pal.line),
        selectedBackgroundColor: const Color(0xFF3A2A06),
        selectedForegroundColor: Pal.amber,
        foregroundColor: Pal.muted,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Pal.surface,
      indicatorColor: const Color(0xFF3A2A06),
      height: 68,
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStatePropertyAll(text.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? Pal.amber : Pal.muted)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Pal.amber : Pal.muted),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? const Color(0xFF5A4210) : Pal.cardHigh),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Pal.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Pal.cardHigh,
      contentTextStyle: text.bodyMedium,
      shape: shape14,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Pal.amber),
    dropdownMenuTheme: DropdownMenuThemeData(inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: Pal.surface, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
  );
}
