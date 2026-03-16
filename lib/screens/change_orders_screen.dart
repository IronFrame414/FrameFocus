import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class ChangeOrdersScreen extends StatefulWidget {
  const ChangeOrdersScreen({super.key});
  @override State<ChangeOrdersScreen> createState() => _ChangeOrdersScreenState();
}

class _ChangeOrdersScreenState extends State<ChangeOrdersScreen> {
  final _db = DatabaseService();
  List<ChangeOrder> _cos = [];
  List<Project> _projects = [];
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _projects = await _db.getProjects();
    _cos = await _db.getAllChangeOrders();
    setState(() => _loading = false);
  }

  void _showCreateDialog() {
    final titleC = TextEditingController();
    final descC = TextEditingController();
    final amountC = TextEditingController();
    int? selectedProject = _projects.isNotEmpty ? _projects.first.id : null;

    showDialog(context: context, builder: (ctx) => AlertDialog(
      title: const Text('New Change Order'),
      content: SizedBox(width: 450, child: Column(mainAxisSize: MainAxisSize.min, children: [
        DropdownButtonFormField<int>(
          value: selectedProject, decoration: const InputDecoration(labelText: 'Project'),
          items: _projects.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
          onChanged: (v) => selectedProject = v,
        ),
        const SizedBox(height: 12),
        TextField(controller: titleC, decoration: const InputDecoration(labelText: 'Title *')),
        const SizedBox(height: 12),
        TextField(controller: amountC, decoration: const InputDecoration(labelText: 'Amount (\$)', prefixText: '\$'), keyboardType: TextInputType.number),
        const SizedBox(height: 12),
        TextField(controller: descC, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3),
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ElevatedButton(onPressed: () async {
          if (titleC.text.isEmpty || selectedProject == null) return;
          final user = context.read<AuthService>().user;
          final num = await _db.getNextCONumber(selectedProject!);
          await _db.createChangeOrder(ChangeOrder(
            projectId: selectedProject!, coNumber: num, title: titleC.text,
            description: descC.text.isEmpty ? null : descC.text,
            amount: double.tryParse(amountC.text) ?? 0, requestedBy: user?.id,
          ));
          if (ctx.mounted) Navigator.pop(ctx);
          _load();
        }, child: const Text('Submit')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().user;
    final pending = _cos.where((c) => c.status == 'pending').toList();
    final approved = _cos.where((c) => c.status == 'approved').toList();
    final rejected = _cos.where((c) => c.status == 'rejected').toList();

    return ListView(padding: const EdgeInsets.all(24), children: [
      Row(children: [
        const Expanded(child: Text('Change Orders', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
        ElevatedButton.icon(onPressed: _showCreateDialog, icon: const Icon(Icons.add, size: 16), label: const Text('New CO')),
      ]),
      const SizedBox(height: 24),

      if (_loading) const Center(child: CircularProgressIndicator())
      else if (_cos.isEmpty) EmptyState(icon: Icons.receipt_long, title: 'No change orders yet', buttonLabel: '+ New CO', onAction: _showCreateDialog)
      else ...[
        // Kanban-style board
        LayoutBuilder(builder: (ctx, constraints) {
          final colWidth = (constraints.maxWidth - 48) / 3;
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _CoColumn('Pending', pending, AppColors.warning, colWidth, user, _load),
            const SizedBox(width: 16),
            _CoColumn('Approved', approved, AppColors.success, colWidth, user, _load),
            const SizedBox(width: 16),
            _CoColumn('Rejected', rejected, AppColors.error, colWidth, user, _load),
          ]);
        }),
      ],
    ]);
  }
}

class _CoColumn extends StatelessWidget {
  final String title;
  final List<ChangeOrder> items;
  final Color color;
  final double width;
  final AppUser? user;
  final VoidCallback onRefresh;
  const _CoColumn(this.title, this.items, this.color, this.width, this.user, this.onRefresh);

  @override
  Widget build(BuildContext context) {
    final db = DatabaseService();
    return SizedBox(width: width, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: Row(children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text('$title (${items.length})', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        ]),
      ),
      const SizedBox(height: 8),
      ...items.map((co) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('CO #${co.coNumber}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
          const SizedBox(height: 4),
          Text(co.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text(formatMoney(co.amount, decimals: 2), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: co.amount >= 0 ? AppColors.success : AppColors.error)),
          if (co.status == 'pending' && (user?.isAdmin ?? false)) ...[
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: OutlinedButton(
                onPressed: () async { await db.updateCOStatus(co.id!, 'rejected', user!.id!); onRefresh(); },
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error)),
                child: const Text('Reject', style: TextStyle(fontSize: 11)),
              )),
              const SizedBox(width: 8),
              Expanded(child: ElevatedButton(
                onPressed: () async { await db.updateCOStatus(co.id!, 'approved', user!.id!); onRefresh(); },
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                child: const Text('Approve', style: TextStyle(fontSize: 11)),
              )),
            ]),
          ],
        ])),
      )),
    ]));
  }
}
