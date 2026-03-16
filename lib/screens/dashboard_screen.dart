import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class DashboardScreen extends StatefulWidget {
  final Function(int)? onNavigate;
  const DashboardScreen({super.key, this.onNavigate});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _db = DatabaseService();
  Map<String, dynamic>? _stats;
  List<Project> _projects = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final stats = await _db.getDashboardStats();
      final projects = await _db.getProjects();
      setState(() { _stats = stats; _projects = projects; _loading = false; });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(padding: const EdgeInsets.all(24), children: [
      // Header
      Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Project Overview', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
          Text('Week ${_weekNumber()} · ${_monthYear()}', style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
        ])),
        OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.download_rounded, size: 16), label: const Text('Export')),
        const SizedBox(width: 8),
        ElevatedButton.icon(
          onPressed: () => widget.onNavigate?.call(1),
          icon: const Icon(Icons.add, size: 16),
          label: const Text('+ New Project'),
        ),
      ]),
      const SizedBox(height: 24),

      // Stats
      if (_loading)
        const LinearProgressIndicator()
      else ...[
        LayoutBuilder(builder: (ctx, constraints) {
          final cols = constraints.maxWidth > 800 ? 4 : 2;
          return Wrap(spacing: 16, runSpacing: 16, children: [
            SizedBox(width: (constraints.maxWidth - 16 * (cols - 1)) / cols, child: StatCard(
              label: 'Active Projects', value: '${_stats?['activeProjects'] ?? 0}',
              subtitle: '↑ ${_stats?['totalProjects'] ?? 0} total', accentColor: AppColors.primary,
            )),
            SizedBox(width: (constraints.maxWidth - 16 * (cols - 1)) / cols, child: StatCard(
              label: 'Total Budget', value: formatMoney((_stats?['totalBudget'] as num?)?.toDouble() ?? 0),
              subtitle: 'active + planning', accentColor: AppColors.info,
            )),
            SizedBox(width: (constraints.maxWidth - 16 * (cols - 1)) / cols, child: StatCard(
              label: 'Pending COs', value: '${_stats?['pendingCOs'] ?? 0}',
              subtitle: _stats?['pendingCOs'] != null && _stats!['pendingCOs'] > 0 ? 'needs attention' : 'all clear',
              accentColor: AppColors.warning,
            )),
            SizedBox(width: (constraints.maxWidth - 16 * (cols - 1)) / cols, child: StatCard(
              label: "Today's Hours", value: '${(_stats?['todayHours'] as num?)?.toStringAsFixed(1) ?? 0}h',
              subtitle: '${_stats?['openBids'] ?? 0} open bids', accentColor: AppColors.success,
            )),
          ]);
        }),
        const SizedBox(height: 24),

        // Active Projects Table
        SectionHeader('Active Projects', trailing: TextButton(onPressed: () => widget.onNavigate?.call(1), child: const Text('View All'))),
        Container(
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
          child: _projects.isEmpty
            ? EmptyState(icon: Icons.folder_open, title: 'No projects yet', buttonLabel: '+ New Project', onAction: () => widget.onNavigate?.call(1))
            : Column(children: [
                // Table header
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
                  child: const Row(children: [
                    Expanded(flex: 3, child: Text('PROJECT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
                    Expanded(flex: 2, child: Text('STATUS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
                    Expanded(flex: 3, child: Text('PROGRESS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
                    Expanded(flex: 2, child: Text('DUE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
                  ]),
                ),
                // Rows
                ..._projects.take(8).map((p) => InkWell(
                  onTap: () {},
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
                    child: Row(children: [
                      Expanded(flex: 3, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary)),
                        if (p.location.isNotEmpty) Text(p.location, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                      ])),
                      Expanded(flex: 2, child: StatusBadge(p.status)),
                      Expanded(flex: 3, child: ProgressBar(value: p.progress)),
                      Expanded(flex: 2, child: Text(formatDate(p.endDate), style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
                    ]),
                  ),
                )),
              ]),
        ),
      ],
    ]),
  );

  String _weekNumber() => '${(DateTime.now().difference(DateTime(DateTime.now().year, 1, 1)).inDays / 7).ceil()}';
  String _monthYear() => '${['January','February','March','April','May','June','July','August','September','October','November','December'][DateTime.now().month - 1]} ${DateTime.now().year}';
}
