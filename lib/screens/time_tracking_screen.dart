import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class TimeTrackingScreen extends StatefulWidget {
  const TimeTrackingScreen({super.key});
  @override State<TimeTrackingScreen> createState() => _TimeTrackingScreenState();
}

class _TimeTrackingScreenState extends State<TimeTrackingScreen> {
  final _db = DatabaseService();
  List<TimeEntry> _entries = [];
  List<Project> _projects = [];
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _entries = await _db.getAllTimeEntries(limit: 100);
    _projects = await _db.getProjects();
    setState(() => _loading = false);
  }

  void _showLogDialog() {
    final hoursC = TextEditingController(text: '8');
    final descC = TextEditingController();
    int? pid = _projects.isNotEmpty ? _projects.first.id : null;
    DateTime date = DateTime.now();

    showDialog(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setS) => AlertDialog(
      title: const Text('Log Time'),
      content: SizedBox(width: 400, child: Column(mainAxisSize: MainAxisSize.min, children: [
        DropdownButtonFormField<int>(
          value: pid, decoration: const InputDecoration(labelText: 'Project'),
          items: _projects.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
          onChanged: (v) => pid = v,
        ),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: hoursC, decoration: const InputDecoration(labelText: 'Hours'), keyboardType: TextInputType.number)),
          const SizedBox(width: 12),
          Expanded(child: OutlinedButton(
            onPressed: () async {
              final d = await showDatePicker(context: ctx, initialDate: date, firstDate: DateTime(2024), lastDate: DateTime.now());
              if (d != null) setS(() => date = d);
            },
            child: Text(formatDate(date)),
          )),
        ]),
        const SizedBox(height: 12),
        TextField(controller: descC, decoration: const InputDecoration(labelText: 'Description'), maxLines: 2),
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ElevatedButton(onPressed: () async {
          if (pid == null) return;
          final user = context.read<AuthService>().user;
          await _db.createTimeEntry(TimeEntry(
            projectId: pid!, userId: user?.id, date: date,
            hours: double.tryParse(hoursC.text) ?? 0, description: descC.text.isEmpty ? null : descC.text,
          ));
          if (ctx.mounted) Navigator.pop(ctx);
          _load();
        }, child: const Text('Log Time')),
      ],
    )));
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().user;
    final today = DateTime.now().toIso8601String().split('T').first;
    final todayEntries = _entries.where((e) => e.date.toIso8601String().split('T').first == today).toList();
    final totalToday = todayEntries.fold<double>(0, (s, e) => s + e.hours);
    final unapproved = _entries.where((e) => !e.approved).length;

    return ListView(padding: const EdgeInsets.all(24), children: [
      Row(children: [
        const Expanded(child: Text('Time Tracking', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
        ElevatedButton.icon(onPressed: _showLogDialog, icon: const Icon(Icons.add, size: 16), label: const Text('Log Time')),
      ]),
      const SizedBox(height: 24),

      Wrap(spacing: 16, runSpacing: 16, children: [
        SizedBox(width: 220, child: StatCard(label: "Today's Hours", value: '${totalToday.toStringAsFixed(1)}h', subtitle: '${todayEntries.length} entries', accentColor: AppColors.success)),
        SizedBox(width: 220, child: StatCard(label: 'Total Entries', value: '${_entries.length}', subtitle: 'all time', accentColor: AppColors.info)),
        SizedBox(width: 220, child: StatCard(label: 'Unapproved', value: '$unapproved', subtitle: 'need approval', accentColor: AppColors.warning)),
      ]),
      const SizedBox(height: 24),

      if (_loading) const Center(child: CircularProgressIndicator())
      else Container(
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
        child: _entries.isEmpty ? const EmptyState(icon: Icons.access_time, title: 'No time entries yet')
        : Column(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
            child: const Row(children: [
              Expanded(flex: 2, child: Text('EMPLOYEE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              Expanded(flex: 2, child: Text('DATE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              SizedBox(width: 70, child: Text('HOURS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              Expanded(flex: 3, child: Text('DESCRIPTION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              SizedBox(width: 100, child: Text('STATUS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
            ]),
          ),
          ..._entries.take(30).map((e) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
            child: Row(children: [
              Expanded(flex: 2, child: Text(e.userName ?? user?.fullName ?? '—', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
              Expanded(flex: 2, child: Text(formatDate(e.date), style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
              SizedBox(width: 70, child: Text('${e.hours}h', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.success))),
              Expanded(flex: 3, child: Text(e.description ?? '—', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary), overflow: TextOverflow.ellipsis)),
              SizedBox(width: 100, child: e.approved
                ? const StatusBadge('approved')
                : (user?.canApprove ?? false)
                  ? TextButton(onPressed: () async { await _db.approveTimeEntry(e.id!, user!.id!); _load(); }, child: const Text('Approve', style: TextStyle(fontSize: 11)))
                  : const StatusBadge('pending')),
            ]),
          )),
        ]),
      ),
    ]);
  }
}
