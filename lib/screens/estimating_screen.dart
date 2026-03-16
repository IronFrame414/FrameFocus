import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class EstimatingScreen extends StatefulWidget {
  const EstimatingScreen({super.key});
  @override State<EstimatingScreen> createState() => _EstimatingScreenState();
}

class _EstimatingScreenState extends State<EstimatingScreen> {
  final _db = DatabaseService();
  List<Estimate> _estimates = [];
  List<Project> _projects = [];
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _projects = await _db.getProjects();
    _estimates = [];
    for (final p in _projects.take(5)) {
      _estimates.addAll(await _db.getEstimates(p.id!));
    }
    setState(() => _loading = false);
  }

  void _showCreateDialog() {
    final titleC = TextEditingController();
    final descC = TextEditingController();
    final markupC = TextEditingController(text: '10');
    int? pid = _projects.isNotEmpty ? _projects.first.id : null;

    showDialog(context: context, builder: (ctx) => AlertDialog(
      title: const Text('New Estimate'),
      content: SizedBox(width: 400, child: Column(mainAxisSize: MainAxisSize.min, children: [
        DropdownButtonFormField<int>(
          value: pid, decoration: const InputDecoration(labelText: 'Project'),
          items: _projects.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
          onChanged: (v) => pid = v,
        ),
        const SizedBox(height: 12),
        TextField(controller: titleC, decoration: const InputDecoration(labelText: 'Estimate Title *')),
        const SizedBox(height: 12),
        TextField(controller: descC, decoration: const InputDecoration(labelText: 'Description'), maxLines: 2),
        const SizedBox(height: 12),
        TextField(controller: markupC, decoration: const InputDecoration(labelText: 'Markup %', suffixText: '%'), keyboardType: TextInputType.number),
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ElevatedButton(onPressed: () async {
          if (titleC.text.isEmpty || pid == null) return;
          final user = context.read<AuthService>().user;
          await _db.createEstimate(Estimate(
            projectId: pid!, title: titleC.text, description: descC.text.isEmpty ? null : descC.text,
            markupPct: double.tryParse(markupC.text) ?? 0, createdBy: user?.id,
          ));
          if (ctx.mounted) Navigator.pop(ctx);
          _load();
        }, child: const Text('Create')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(24), children: [
    Row(children: [
      const Expanded(child: Text('Estimating', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
      ElevatedButton.icon(onPressed: _showCreateDialog, icon: const Icon(Icons.add, size: 16), label: const Text('New Estimate')),
    ]),
    const SizedBox(height: 24),

    if (_loading) const Center(child: CircularProgressIndicator())
    else if (_estimates.isEmpty) EmptyState(icon: Icons.calculate, title: 'No estimates yet', buttonLabel: '+ New Estimate', onAction: _showCreateDialog)
    else ..._estimates.map((e) => Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(e.title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          if (e.description != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(e.description!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
          const SizedBox(height: 6),
          Text('Markup: ${e.markupPct}%  ·  Tax: ${e.taxPct}%', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          StatusBadge(e.status),
          const SizedBox(height: 8),
          Text(formatMoney(e.total), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
        ]),
      ])),
    )),
  ]);
}
