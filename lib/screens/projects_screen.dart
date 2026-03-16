import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});
  @override State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _db = DatabaseService();
  List<Project> _projects = [];
  bool _loading = true;
  String _filter = 'all';

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _projects = await _db.getProjects();
    setState(() => _loading = false);
  }

  List<Project> get _filtered => _filter == 'all' ? _projects : _projects.where((p) => p.status == _filter).toList();

  void _showCreateDialog() {
    final nameC = TextEditingController();
    final descC = TextEditingController();
    final budgetC = TextEditingController();
    final addressC = TextEditingController();
    final cityC = TextEditingController();
    final stateC = TextEditingController(text: 'FL');
    final zipC = TextEditingController();
    DateTime? startDate, endDate;

    showDialog(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setS) => AlertDialog(
      title: const Text('New Project'),
      content: SizedBox(width: 500, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: nameC, decoration: const InputDecoration(labelText: 'Project Name *')),
        const SizedBox(height: 12),
        TextField(controller: descC, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3),
        const SizedBox(height: 12),
        TextField(controller: budgetC, decoration: const InputDecoration(labelText: 'Budget (\$)', prefixText: '\$'), keyboardType: TextInputType.number),
        const SizedBox(height: 12),
        TextField(controller: addressC, decoration: const InputDecoration(labelText: 'Address')),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: cityC, decoration: const InputDecoration(labelText: 'City'))),
          const SizedBox(width: 12),
          SizedBox(width: 80, child: TextField(controller: stateC, decoration: const InputDecoration(labelText: 'State'))),
          const SizedBox(width: 12),
          SizedBox(width: 100, child: TextField(controller: zipC, decoration: const InputDecoration(labelText: 'ZIP'))),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton(
            onPressed: () async {
              final d = await showDatePicker(context: ctx, initialDate: DateTime.now(), firstDate: DateTime(2024), lastDate: DateTime(2030));
              if (d != null) setS(() => startDate = d);
            },
            child: Text(startDate != null ? formatDate(startDate) : 'Start Date'),
          )),
          const SizedBox(width: 12),
          Expanded(child: OutlinedButton(
            onPressed: () async {
              final d = await showDatePicker(context: ctx, initialDate: DateTime.now().add(const Duration(days: 90)), firstDate: DateTime(2024), lastDate: DateTime(2030));
              if (d != null) setS(() => endDate = d);
            },
            child: Text(endDate != null ? formatDate(endDate) : 'End Date'),
          )),
        ]),
      ]))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ElevatedButton(onPressed: () async {
          if (nameC.text.isEmpty) return;
          final user = context.read<AuthService>().user;
          await _db.createProject(Project(
            name: nameC.text, description: descC.text.isEmpty ? null : descC.text,
            budget: double.tryParse(budgetC.text) ?? 0,
            address: addressC.text.isEmpty ? null : addressC.text,
            city: cityC.text.isEmpty ? null : cityC.text,
            state: stateC.text.isEmpty ? null : stateC.text,
            zip: zipC.text.isEmpty ? null : zipC.text,
            startDate: startDate, endDate: endDate, ownerId: user?.id,
          ));
          if (ctx.mounted) Navigator.pop(ctx);
          _load();
        }, child: const Text('Create Project')),
      ],
    )));
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(24), children: [
    Row(children: [
      const Expanded(child: Text('Projects', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
      SegmentedButton<String>(
        segments: const [
          ButtonSegment(value: 'all', label: Text('All')),
          ButtonSegment(value: 'active', label: Text('Active')),
          ButtonSegment(value: 'planning', label: Text('Planning')),
          ButtonSegment(value: 'completed', label: Text('Completed')),
        ],
        selected: {_filter},
        onSelectionChanged: (v) => setState(() => _filter = v.first),
      ),
      const SizedBox(width: 12),
      ElevatedButton.icon(onPressed: _showCreateDialog, icon: const Icon(Icons.add, size: 16), label: const Text('New Project')),
    ]),
    const SizedBox(height: 24),

    if (_loading) const Center(child: CircularProgressIndicator())
    else if (_filtered.isEmpty) EmptyState(icon: Icons.folder_open, title: 'No projects found', buttonLabel: '+ New Project', onAction: _showCreateDialog)
    else ..._filtered.map((p) => Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(p.name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          Text([p.address, p.location].where((s) => s != null && s.isNotEmpty).join(' · '),
            style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          if (p.description != null && p.description!.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text(p.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          StatusBadge(p.status),
          const SizedBox(height: 8),
          Text(formatMoney(p.budget), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
          Text('${formatDateShort(p.startDate)} – ${formatDateShort(p.endDate)}', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
        ]),
      ])),
    )),
  ]);
}
