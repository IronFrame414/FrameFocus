import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class BidRequestsScreen extends StatefulWidget {
  const BidRequestsScreen({super.key});
  @override State<BidRequestsScreen> createState() => _BidRequestsScreenState();
}

class _BidRequestsScreenState extends State<BidRequestsScreen> {
  final _db = DatabaseService();
  List<BidRequest> _brs = [];
  List<Project> _projects = [];
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _brs = await _db.getAllBidRequests();
    _projects = await _db.getProjects();
    setState(() => _loading = false);
  }

  void _showCreateDialog() {
    final titleC = TextEditingController();
    final scopeC = TextEditingController();
    int? pid = _projects.isNotEmpty ? _projects.first.id : null;
    DateTime? due;

    showDialog(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setS) => AlertDialog(
      title: const Text('New Bid Request'),
      content: SizedBox(width: 450, child: Column(mainAxisSize: MainAxisSize.min, children: [
        DropdownButtonFormField<int>(
          value: pid, decoration: const InputDecoration(labelText: 'Project'),
          items: _projects.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
          onChanged: (v) => pid = v,
        ),
        const SizedBox(height: 12),
        TextField(controller: titleC, decoration: const InputDecoration(labelText: 'Title *')),
        const SizedBox(height: 12),
        TextField(controller: scopeC, decoration: const InputDecoration(labelText: 'Scope of Work'), maxLines: 4),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () async {
            final d = await showDatePicker(context: ctx, initialDate: DateTime.now().add(const Duration(days: 14)), firstDate: DateTime.now(), lastDate: DateTime(2030));
            if (d != null) setS(() => due = d);
          },
          child: Text(due != null ? 'Due: ${formatDate(due)}' : 'Set Due Date'),
        ),
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ElevatedButton(onPressed: () async {
          if (titleC.text.isEmpty || pid == null) return;
          await _db.createBidRequest(pid!, titleC.text, scopeC.text.isEmpty ? null : scopeC.text, due);
          if (ctx.mounted) Navigator.pop(ctx);
          _load();
        }, child: const Text('Send Request')),
      ],
    )));
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(24), children: [
    Row(children: [
      const Expanded(child: Text('Bid Requests', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
      ElevatedButton.icon(onPressed: _showCreateDialog, icon: const Icon(Icons.add, size: 16), label: const Text('New Request')),
    ]),
    const SizedBox(height: 24),

    if (_loading) const Center(child: CircularProgressIndicator())
    else if (_brs.isEmpty) EmptyState(icon: Icons.gavel, title: 'No bid requests yet', buttonLabel: '+ New Request', onAction: _showCreateDialog)
    else ..._brs.map((br) => Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(br.title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
          StatusBadge(br.status),
        ]),
        if (br.scope != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(br.scope!, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
        const SizedBox(height: 8),
        Row(children: [
          Text('Due: ${formatDate(br.dueDate)}', style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          const Spacer(),
          Text('${br.bids.length} bid${br.bids.length != 1 ? 's' : ''} received', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.info)),
        ]),
        if (br.bids.isNotEmpty) ...[
          const Divider(height: 20),
          ...br.bids.map((b) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              Expanded(child: Text(b.vendorName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
              Text(b.amount != null ? formatMoney(b.amount!, decimals: 0) : '—', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: b.isSelected ? AppColors.success : AppColors.textPrimary)),
              if (b.isSelected) const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.check_circle, size: 16, color: AppColors.success)),
            ]),
          )),
        ],
      ])),
    )),
  ]);
}
