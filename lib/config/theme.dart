import 'package:flutter/material.dart';

class AppColors {
  // Primary - Steel Blue
  static const primary = Color(0xFF0F2A44);
  static const primaryLight = Color(0xFF1A3A5C);
  static const primaryDark = Color(0xFF091E33);

  // Accent - Amber/Orange
  static const accent = Color(0xFFD4883E);
  static const accentLight = Color(0xFFF0A54E);
  static const accentDark = Color(0xFFB87230);

  // Sidebar
  static const sidebar = Color(0xFF0D2137);
  static const sidebarActive = Color(0xFF1565C0);
  static const sidebarText = Color(0xFF8CA8C4);
  static const sidebarTextActive = Color(0xFF4FC3F7);

  // Background
  static const background = Color(0xFFF5F7FA);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceDark = Color(0xFFF0F2F5);

  // Text
  static const textPrimary = Color(0xFF1A2B3D);
  static const textSecondary = Color(0xFF5A6B7D);
  static const textMuted = Color(0xFF8E9BAA);

  // Status
  static const success = Color(0xFF2E7D32);
  static const successLight = Color(0xFFE8F5E9);
  static const warning = Color(0xFFED6C02);
  static const warningLight = Color(0xFFFFF3E0);
  static const error = Color(0xFFC62828);
  static const errorLight = Color(0xFFFFEBEE);
  static const info = Color(0xFF1565C0);
  static const infoLight = Color(0xFFE3F2FD);

  // Borders
  static const border = Color(0xFFE0E4EA);
  static const borderDark = Color(0xFFCCD2DA);

  // Cards
  static const cardShadow = Color(0x0A000000);
}

class AppTheme {
  static ThemeData get light => ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: 'Roboto',
    colorScheme: ColorScheme.light(
      primary: AppColors.primary,
      secondary: AppColors.accent,
      surface: AppColors.surface,
      error: AppColors.error,
    ),
    scaffoldBackgroundColor: AppColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.textPrimary,
      elevation: 0,
      scrolledUnderElevation: 1,
    ),
    cardTheme: CardTheme(
      color: AppColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.primary, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      labelStyle: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
      hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 13),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        side: const BorderSide(color: AppColors.border),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primary,
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    dividerTheme: const DividerThemeData(color: AppColors.border, thickness: 1),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surfaceDark,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
  );
}
