import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';

// ─── Stat Card ───────────────────────────────────────────────────────────────
class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String? subtitle;
  final Color accentColor;
  final IconData? icon;

  const StatCard({
    super.key, required this.label, required this.value,
    this.subtitle, this.accentColor = AppColors.primary, this.icon,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.border),
      boxShadow: [BoxShadow(color: AppColors.cardShadow, blurRadius: 8, offset: const Offset(0, 2))],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: accentColor.withOpacity(0.7))),
      const SizedBox(height: 8),
      Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      if (subtitle != null) ...[
        const SizedBox(height: 4),
        Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
      ],
    ]),
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────
class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});

  @override
  Widget build(BuildContext context) {
    final (color, bg) = switch (status.toLowerCase()) {
      'active' || 'approved' || 'on track' => (AppColors.success, AppColors.successLight),
      'planning' || 'open' || 'sent' || 'draft' => (AppColors.info, AppColors.infoLight),
      'pending' || 'on_hold' || 'delayed' || 'revised' => (AppColors.warning, AppColors.warningLight),
      'rejected' || 'cancelled' || 'overdue' || 'void' => (AppColors.error, AppColors.errorLight),
      'completed' || 'awarded' => (const Color(0xFF6A1B9A), const Color(0xFFF3E5F5)),
      _ => (AppColors.textMuted, AppColors.surfaceDark),
    };
    final label = status.replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.3))),
      child: Text(label[0].toUpperCase() + label.substring(1), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

// ─── Progress Bar ────────────────────────────────────────────────────────────
class ProgressBar extends StatelessWidget {
  final double value;
  final Color? color;
  const ProgressBar({super.key, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? (value > 0.9 ? AppColors.error : value > 0.7 ? AppColors.warning : AppColors.success);
    return Row(children: [
      Expanded(child: Container(
        height: 8, decoration: BoxDecoration(color: AppColors.surfaceDark, borderRadius: BorderRadius.circular(4)),
        child: FractionallySizedBox(
          alignment: Alignment.centerLeft, widthFactor: value.clamp(0, 1),
          child: Container(decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
        ),
      )),
      const SizedBox(width: 8),
      Text('${(value * 100).toInt()}%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c)),
    ]);
  }
}

// ─── Empty State ─────────────────────────────────────────────────────────────
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? buttonLabel;
  final VoidCallback? onAction;

  const EmptyState({super.key, required this.icon, required this.title, this.subtitle, this.buttonLabel, this.onAction});

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(padding: const EdgeInsets.all(48), child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 56, color: AppColors.textMuted.withOpacity(0.4)),
      const SizedBox(height: 16),
      Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
      if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.textMuted))),
      if (buttonLabel != null) Padding(padding: const EdgeInsets.only(top: 20), child: ElevatedButton(onPressed: onAction, child: Text(buttonLabel!))),
    ])),
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────
class SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionHeader(this.title, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(children: [
      Text(title.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted)),
      const Spacer(),
      if (trailing != null) trailing!,
    ]),
  );
}

// ─── Money Formatter ─────────────────────────────────────────────────────────
String formatMoney(double amount, {int decimals = 0}) {
  if (amount >= 1000000) return '\$${(amount / 1000000).toStringAsFixed(1)}M';
  if (amount >= 1000 && decimals == 0) return '\$${(amount / 1000).toStringAsFixed(0)}K';
  return NumberFormat.currency(symbol: '\$', decimalDigits: decimals).format(amount);
}

String formatDate(DateTime? date) {
  if (date == null) return '—';
  return DateFormat('MMM d, y').format(date);
}

String formatDateShort(DateTime? date) {
  if (date == null) return '—';
  return DateFormat('MMM d').format(date);
}

// ─── Loading Shimmer ─────────────────────────────────────────────────────────
class LoadingCard extends StatelessWidget {
  const LoadingCard({super.key});
  @override
  Widget build(BuildContext context) => Container(
    height: 100, margin: const EdgeInsets.only(bottom: 12),
    decoration: BoxDecoration(color: AppColors.surfaceDark, borderRadius: BorderRadius.circular(12)),
  );
}
