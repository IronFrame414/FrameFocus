import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class DailyLogScreen extends StatefulWidget {
  const DailyLogScreen({super.key});
  @override State<DailyLogScreen> createState() => _DailyLogScreenState();
}

class _DailyLogScreenState extends State<DailyLogScreen> {
  final _db = DatabaseService();
  List<DailyLog> _logs = [];
  List<Project> _projects = [];
  int? _selectedProject;
  bool _loading = true;

  final _summaryC = TextEditingController();
  final _weatherC = TextEditingController();
  final _delaysC = TextEditingController();
  final _safetyC = TextEditingController();
  final _crewC = TextEditingController(text: '0');

  @override void initState() { super.initState(); _loadProjects(); }

  Future<void> _loadProjects() async {
    _projects = await _db.getProjects();
    if (_projects.isNotEmpty) { _selectedProject = _projects.first.id; await _loadLogs(); }
    else setState(() => _loading = false);
  }

  Future<void> _loadLogs() async {
    if (_selectedProject == null) return;
    setState(() => _loading = true);
    _logs = await _db.getDailyLogs(_selectedProject!);
    setState(() => _loading = false);
  }

  Future<void> _submit() async {
    if (_selectedProject == null) return;
    final user = context.read<AuthService>().user;
    try {
      await _db.createDailyLog(DailyLog(
        projectId: _selectedProject!, date: DateTime.now(),
        weather: _weatherC.text.isEmpty ? null : _weatherC.text,
        crewCount: int.tryParse(_crewC.text) ?? 0,
        summary: _summaryC.text.isEmpty ? null : _summaryC.text,
        delays: _delaysC.text.isEmpty ? null : _delaysC.text,
        safetyNotes: _safetyC.text.isEmpty ? null : _safetyC.text,
        createdBy: user?.id,
      ));
      _summaryC.clear(); _weatherC.clear(); _delaysC.clear(); _safetyC.clear();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Daily log submitted!')));
      _loadLogs();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(24), children: [
    Row(children: [
      const Expanded(child: Text('Daily Logs', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
      if (_projects.isNotEmpty) DropdownButton<int>(
        value: _selectedProject,
        items: _projects.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
        onChanged: (v) { _selectedProject = v; _loadLogs(); },
      ),
    ]),
    const SizedBox(height: 24),

    // Entry form
    Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text("Today's Log — ${formatDate(DateTime.now())}", style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: TextField(controller: _weatherC, decoration: const InputDecoration(labelText: 'Weather', prefixIcon: Icon(Icons.cloud)))),
        const SizedBox(width: 12),
        SizedBox(width: 120, child: TextField(controller: _crewC, decoration: const InputDecoration(labelText: 'Crew Count'), keyboardType: TextInputType.number)),
      ]),
      const SizedBox(height: 12),
      TextField(controller: _summaryC, decoration: const InputDecoration(labelText: 'Work Summary'), maxLines: 4),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: TextField(controller: _delaysC, decoration: const InputDecoration(labelText: 'Delays / Issues'), maxLines: 2)),
        const SizedBox(width: 12),
        Expanded(child: TextField(controller: _safetyC, decoration: const InputDecoration(labelText: 'Safety Notes'), maxLines: 2)),
      ]),
      const SizedBox(height: 16),
      ElevatedButton.icon(onPressed: _submit, icon: const Icon(Icons.send, size: 16), label: const Text('Submit Daily Log')),
    ]))),
    const SizedBox(height: 24),

    // History
    SectionHeader('Log History'),
    if (_loading) const Center(child: CircularProgressIndicator())
    else if (_logs.isEmpty) const EmptyState(icon: Icons.calendar_today, title: 'No logs yet for this project')
    else ..._logs.map((l) => Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(formatDate(l.date), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const Spacer(),
          if (l.weather != null) Text(l.weather!, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          const SizedBox(width: 12),
          Text('Crew: ${l.crewCount}', style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
        ]),
        if (l.summary != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(l.summary!, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
        if (l.delays != null && l.delays!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Row(children: [
          const Icon(Icons.warning_amber, size: 14, color: AppColors.warning),
          const SizedBox(width: 6),
          Expanded(child: Text(l.delays!, style: const TextStyle(fontSize: 12, color: AppColors.warning))),
        ])),
      ])),
    )),
  ]);
}
