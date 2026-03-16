import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../services/database_service.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});
  @override State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  final _db = DatabaseService();
  List<CatalogItem> _items = [];
  List<String> _categories = [];
  String? _selectedCategory;
  String _search = '';
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    _items = await _db.getCatalog(category: _selectedCategory, search: _search.isEmpty ? null : _search);
    _categories = await _db.getCatalogCategories();
    setState(() => _loading = false);
  }

  void _showAddDialog() {
    final codeC = TextEditingController();
    final nameC = TextEditingController();
    final catC = TextEditingController();
    final unitC = TextEditingController(text: 'ea');
    final costC = TextEditingController();
    final laborC = TextEditingController();
    final descC = TextEditingController();

    showDialog(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Add Catalog Item'),
      content: SizedBox(width: 450, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          SizedBox(width: 120, child: TextField(controller: codeC, decoration: const InputDecoration(labelText: 'Code'))),
          const SizedBox(width: 12),
          Expanded(child: TextField(controller: nameC, decoration: const InputDecoration(labelText: 'Name *'))),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: catC, decoration: const InputDecoration(labelText: 'Category'))),
          const SizedBox(width: 12),
          SizedBox(width: 80, child: TextField(controller: unitC, decoration: const InputDecoration(labelText: 'Unit'))),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: costC, decoration: const InputDecoration(labelText: 'Unit Cost', prefixText: '\$'), keyboardType: TextInputType.number)),
          const SizedBox(width: 12),
          Expanded(child: TextField(controller: laborC, decoration: const InputDecoration(labelText: 'Labor Cost', prefixText: '\$'), keyboardType: TextInputType.number)),
        ]),
        const SizedBox(height: 12),
        TextField(controller: descC, decoration: const InputDecoration(labelText: 'Description'), maxLines: 2),
      ]))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ElevatedButton(onPressed: () async {
          if (nameC.text.isEmpty) return;
          await _db.upsertCatalogItem(CatalogItem(
            code: codeC.text.isEmpty ? null : codeC.text, name: nameC.text,
            category: catC.text.isEmpty ? null : catC.text, unit: unitC.text,
            unitCost: double.tryParse(costC.text) ?? 0, laborCost: double.tryParse(laborC.text) ?? 0,
            description: descC.text.isEmpty ? null : descC.text,
          ));
          if (ctx.mounted) Navigator.pop(ctx);
          _load();
        }, child: const Text('Save')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Cost Catalog')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      Row(children: [
        Expanded(child: TextField(
          decoration: const InputDecoration(hintText: 'Search catalog...', prefixIcon: Icon(Icons.search), isDense: true),
          onChanged: (v) { _search = v; _load(); },
        )),
        const SizedBox(width: 12),
        DropdownButton<String?>(
          value: _selectedCategory, hint: const Text('All Categories'),
          items: [const DropdownMenuItem(value: null, child: Text('All Categories')), ..._categories.map((c) => DropdownMenuItem(value: c, child: Text(c)))],
          onChanged: (v) { _selectedCategory = v; _load(); },
        ),
        const SizedBox(width: 12),
        ElevatedButton.icon(onPressed: _showAddDialog, icon: const Icon(Icons.add, size: 16), label: const Text('Add Item')),
      ]),
      const SizedBox(height: 16),

      if (_loading) const Center(child: CircularProgressIndicator())
      else Container(
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
        child: _items.isEmpty ? const EmptyState(icon: Icons.inventory_2, title: 'No catalog items')
        : Column(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
            child: const Row(children: [
              SizedBox(width: 80, child: Text('CODE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              Expanded(flex: 3, child: Text('ITEM', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              Expanded(flex: 2, child: Text('CATEGORY', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              SizedBox(width: 60, child: Text('UNIT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              SizedBox(width: 90, child: Text('UNIT COST', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
              SizedBox(width: 90, child: Text('LABOR', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: AppColors.textMuted))),
            ]),
          ),
          ..._items.map((i) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
            child: Row(children: [
              SizedBox(width: 80, child: Text(i.code ?? '—', style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontFamily: 'monospace'))),
              Expanded(flex: 3, child: Text(i.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
              Expanded(flex: 2, child: Text(i.category ?? '—', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
              SizedBox(width: 60, child: Text(i.unit, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
              SizedBox(width: 90, child: Text(formatMoney(i.unitCost, decimals: 2), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.success))),
              SizedBox(width: 90, child: Text(formatMoney(i.laborCost, decimals: 2), style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
            ]),
          )),
        ]),
      ),
      const SizedBox(height: 8),
      Text('${_items.length} items', style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
    ]),
  );
}
