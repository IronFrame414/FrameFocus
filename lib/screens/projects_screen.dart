import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../services/database_service.dart';
import '../services/client_service.dart';
import '../models/models.dart';
import '../models/client.dart';
import '../widgets/common.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});
  @override State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _db = DatabaseService();
  final _clientService = ClientService();
  List<Project> _projects = [];
  List<Client> _clients = [];
  bool _loading = true;
  String _filter = 'all';

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _db.getProjects(),
        _clientService.getClients(),
      ]);
      _projects = results[0] as List<Project>;
      _clients  = results[1] as List<Client>;
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error loading: $e'), backgroundColor: AppColors.error));
    }
    setState(() => _loading = false);
  }

  List<Project> get _filtered => _filter == 'all'
      ? _projects
      : _projects.where((p) => p.status == _filter).toList();

  String _clientName(String? clientId) {
    if (clientId == null) return '';
    try {
      return _clients.firstWhere((c) => c.id == clientId).name;
    } catch (_) {
      return '';
    }
  }

  void _showCreateDialog() {
    final nameC    = TextEditingController();
    final descC    = TextEditingController();
    final budgetC  = TextEditingController();
    final addressC = TextEditingController();
    final cityC    = TextEditingController();
    final stateC   = TextEditingController(text: 'FL');
    final zipC     = TextEditingController();
    String status      = 'planning';
    String projectType = 'Residential';
    String? selectedClientId;
    DateTime? startDate, endDate;
    bool saving = false;

    showDialog(context: context, builder: (ctx) => StatefulBuilder(
      builder: (ctx, setS) => AlertDialog(
        title: const Text('New Project'),
        content: SizedBox(width: 520, child: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Client picker
            DropdownButtonFormField<String>(
              value: selectedClientId,
              decoration: const InputDecoration(labelText: 'Client *', border: OutlineInputBorder()),
              items: _clients.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))).toList(),
              onChanged: (v) => setS(() => selectedClientId = v),
            ),
            const SizedBox(height: 12),
            TextField(controller: nameC, decoration: const InputDecoration(
              labelText: 'Project Name *', hintText: 'e.g. Riverside Office Complex')),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: DropdownButtonFormField<String>(
                value: projectType,
                decoration: const InputDecoration(labelText: 'Project Type'),
                items: ['Residential','Commercial','Industrial','Multi-Family','Renovation','Other']
                    .map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                onChanged: (v) => setS(() => projectType = v!),
              )),
              const SizedBox(width: 12),
              Expanded(child: DropdownButtonFormField<String>(
                value: status,
                decoration: const InputDecoration(labelText: 'Status'),
                items: ['planning','active','on_hold']
                    .map((s) => DropdownMenuItem(value: s, child: Text(s.replaceAll('_',' ')))).toList(),
                onChanged: (v) => setS(() => status = v!),
              )),
            ]),
            const SizedBox(height: 12),
            TextField(controller: descC, decoration: const InputDecoration(
              labelText: 'Description', hintText: 'Describe the scope of work...'), maxLines: 3),
            const SizedBox(height: 12),
            TextField(controller: budgetC, decoration: const InputDecoration(
              labelText: 'Budget', prefixText: '\$ ', hintText: '0.00'),
              keyboardType: TextInputType.number),
            const SizedBox(height: 16),
            const Align(alignment: Alignment.centerLeft, child: Text('Location',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textSecondary))),
            const SizedBox(height: 8),
            TextField(controller: addressC, decoration: const InputDecoration(
              labelText: 'Street Address', hintText: '1234 Main St')),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: TextField(controller: cityC,
                decoration: const InputDecoration(labelText: 'City'))),
              const SizedBox(width: 12),
              SizedBox(width: 80, child: TextField(controller: stateC,
                decoration: const InputDecoration(labelText: 'State'))),
              const SizedBox(width: 12),
              SizedBox(width: 100, child: TextField(controller: zipC,
                decoration: const InputDecoration(labelText: 'ZIP'))),
            ]),
            const SizedBox(height: 16),
            const Align(alignment: Alignment.centerLeft, child: Text('Schedule',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textSecondary))),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: OutlinedButton.icon(
                icon: const Icon(Icons.calendar_today, size: 14),
                onPressed: () async {
                  final d = await showDatePicker(context: ctx,
                    initialDate: DateTime.now(), firstDate: DateTime(2024), lastDate: DateTime(2030));
                  if (d != null) setS(() => startDate = d);
                },
                label: Text(startDate != null ? formatDate(startDate) : 'Start Date'),
              )),
              const SizedBox(width: 12),
              Expanded(child: OutlinedButton.icon(
                icon: const Icon(Icons.calendar_today, size: 14),
                onPressed: () async {
                  final d = await showDatePicker(context: ctx,
                    initialDate: DateTime.now().add(const Duration(days: 90)),
                    firstDate: DateTime(2024), lastDate: DateTime(2030));
                  if (d != null) setS(() => endDate = d);
                },
                label: Text(endDate != null ? formatDate(endDate) : 'End Date'),
              )),
            ]),
          ],
        ))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: saving ? null : () async {
              if (nameC.text.isEmpty) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(content: Text('Project name is required')));
                return;
              }
              if (selectedClientId == null) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(content: Text('Please select a client')));
                return;
              }
              setS(() => saving = true);
              try {
                await _db.createProject(Project(
                  name: nameC.text,
                  description: descC.text.isEmpty ? '$projectType project' : descC.text,
                  status: status,
                  budget: double.tryParse(budgetC.text.replaceAll(',','')) ?? 0,
                  address: addressC.text.isEmpty ? null : addressC.text,
                  city: cityC.text.isEmpty ? null : cityC.text,
                  state: stateC.text.isEmpty ? null : stateC.text,
                  zip: zipC.text.isEmpty ? null : zipC.text,
                  startDate: startDate, endDate: endDate,
                  clientId: selectedClientId,
                ));
                if (ctx.mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: Text('Project "${nameC.text}" created!'),
                    backgroundColor: AppColors.success));
                }
                _load();
              } catch (e) {
                setS(() => saving = false);
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                  SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
              }
            },
            child: saving
                ? const SizedBox(width: 16, height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Create Project'),
          ),
        ],
      ),
    ));
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(padding: const EdgeInsets.all(24), children: [
      Row(children: [
        const Expanded(child: Text('Projects',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'all',       label: Text('All')),
            ButtonSegment(value: 'active',    label: Text('Active')),
            ButtonSegment(value: 'planning',  label: Text('Planning')),
            ButtonSegment(value: 'completed', label: Text('Completed')),
          ],
          selected: {_filter},
          onSelectionChanged: (v) => setState(() => _filter = v.first),
        ),
        const SizedBox(width: 12),
        ElevatedButton.icon(
          onPressed: _showCreateDialog,
          icon: const Icon(Icons.add, size: 16),
          label: const Text('New Project')),
      ]),
      const SizedBox(height: 24),

      if (_loading) const Center(child: CircularProgressIndicator())
      else if (_filtered.isEmpty) EmptyState(
        icon: Icons.folder_open,
        title: 'No projects found',
        subtitle: 'Create your first project to get started',
        buttonLabel: '+ New Project',
        onAction: _showCreateDialog)
      else ..._filtered.map((p) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {},
          child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.name, style: const TextStyle(
                fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              const SizedBox(height: 2),
              if (_clientName(p.clientId).isNotEmpty)
                Text(_clientName(p.clientId), style: const TextStyle(
                  fontSize: 12, color: AppColors.accent, fontWeight: FontWeight.w500)),
              const SizedBox(height: 2),
              Text([p.address, p.location].where((s) => s != null && s.isNotEmpty).join(' · '),
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
              if (p.description != null && p.description!.isNotEmpty)
                Padding(padding: const EdgeInsets.only(top: 6), child: Text(p.description!,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
              const SizedBox(height: 8),
              ProgressBar(value: p.progress),
            ])),
            const SizedBox(width: 16),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              StatusBadge(p.status),
              const SizedBox(height: 8),
              Text(formatMoney(p.budget), style: const TextStyle(
                fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
              Text('${formatDateShort(p.startDate)} – ${formatDateShort(p.endDate)}',
                style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
            ]),
          ])),
        ),
      )),
    ]),
  );
}
