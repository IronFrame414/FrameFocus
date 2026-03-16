import 'package:supabase_flutter/supabase_flutter.dart';
import '../config/supabase_config.dart';
import '../models/models.dart';

class DatabaseService {
  SupabaseClient get _db => SupabaseConfig.client;

  // ── Projects ───────────────────────────────────────────────────────────────
  Future<List<Project>> getProjects() async {
    final data = await _db.from('projects')
        .select('*')
        .order('updated_at', ascending: false);
    return data.map((m) => Project.fromMap(m)).toList();
  }

  Future<Project> createProject(Project p) async {
    final map = <String, dynamic>{
      'name': p.name,
      'description': p.description,
      'status': p.status,
      'address': p.address,
      'city': p.city,
      'state': p.state,
      'zip': p.zip,
      'budget': p.budget,
    };
    if (p.startDate != null) map['start_date'] = p.startDate!.toIso8601String().split('T').first;
    if (p.endDate != null) map['end_date'] = p.endDate!.toIso8601String().split('T').first;
    if (p.ownerId != null) map['owner_id'] = p.ownerId;
    final data = await _db.from('projects').insert(map).select().single();
    return Project.fromMap(data);
  }

  Future<void> updateProject(int id, Map<String, dynamic> fields) async {
    await _db.from('projects').update(fields).eq('id', id);
  }

  Future<void> deleteProject(int id) async {
    await _db.from('projects').delete().eq('id', id);
  }

  // ── Change Orders ──────────────────────────────────────────────────────────
  Future<List<ChangeOrder>> getChangeOrders(int projectId) async {
    final data = await _db.from('change_orders')
        .select('*')
        .eq('project_id', projectId).order('co_number');
    return data.map((m) => ChangeOrder.fromMap(m)).toList();
  }

  Future<List<ChangeOrder>> getAllChangeOrders() async {
    final data = await _db.from('change_orders')
        .select('*')
        .order('created_at', ascending: false);
    return data.map((m) => ChangeOrder.fromMap(m)).toList();
  }

  Future<int> getNextCONumber(int projectId) async {
    final data = await _db.from('change_orders')
        .select('co_number').eq('project_id', projectId)
        .order('co_number', ascending: false).limit(1);
    return (data.isNotEmpty ? (data.first['co_number'] as int) : 0) + 1;
  }

  Future<ChangeOrder> createChangeOrder(ChangeOrder co) async {
    final data = await _db.from('change_orders').insert(co.toInsert()).select().single();
    return ChangeOrder.fromMap(data);
  }

  Future<void> updateCOStatus(int id, String status, int approvedBy) async {
    await _db.from('change_orders').update({
      'status': status, 'approved_by': approvedBy,
      'approved_at': DateTime.now().toIso8601String(),
    }).eq('id', id);
  }

  // ── Catalog ────────────────────────────────────────────────────────────────
  Future<List<CatalogItem>> getCatalog({String? category, String? search}) async {
    var query = _db.from('catalog_items').select().eq('is_active', true);
    if (category != null && category.isNotEmpty) query = query.eq('category', category);
    if (search != null && search.isNotEmpty) {
      query = query.or('name.ilike.%$search%,code.ilike.%$search%');
    }
    final data = await query.order('category').order('name');
    return data.map((m) => CatalogItem.fromMap(m)).toList();
  }

  Future<List<String>> getCatalogCategories() async {
    final data = await _db.from('catalog_items').select('category').eq('is_active', true);
    return data.map((m) => m['category'] as String?).where((c) => c != null && c.isNotEmpty).cast<String>().toSet().toList()..sort();
  }

  Future<CatalogItem> upsertCatalogItem(CatalogItem item) async {
    final data = await _db.from('catalog_items').upsert(item.toMap()).select().single();
    return CatalogItem.fromMap(data);
  }

  Future<void> deleteCatalogItem(int id) async {
    await _db.from('catalog_items').update({'is_active': false}).eq('id', id);
  }

  // ── Time Entries ───────────────────────────────────────────────────────────
  Future<List<TimeEntry>> getTimeEntries(int projectId) async {
    final data = await _db.from('time_entries')
        .select('*')
        .eq('project_id', projectId).order('date', ascending: false);
    return data.map((m) => TimeEntry.fromMap(m)).toList();
  }

  Future<List<TimeEntry>> getAllTimeEntries({int limit = 50}) async {
    final data = await _db.from('time_entries')
        .select('*')
        .order('date', ascending: false).limit(limit);
    return data.map((m) => TimeEntry.fromMap(m)).toList();
  }

  Future<TimeEntry> createTimeEntry(TimeEntry entry) async {
    final data = await _db.from('time_entries').insert(entry.toInsert()).select().single();
    return TimeEntry.fromMap(data);
  }

  Future<void> approveTimeEntry(int id, int approvedBy) async {
    await _db.from('time_entries').update({'approved': true, 'approved_by': approvedBy}).eq('id', id);
  }

  // ── Daily Logs ─────────────────────────────────────────────────────────────
  Future<List<DailyLog>> getDailyLogs(int projectId) async {
    final data = await _db.from('daily_logs')
        .select('*')
        .eq('project_id', projectId).order('date', ascending: false);
    return data.map((m) => DailyLog.fromMap(m)).toList();
  }

  Future<DailyLog> createDailyLog(DailyLog log) async {
    final data = await _db.from('daily_logs').insert(log.toInsert()).select().single();
    return DailyLog.fromMap(data);
  }

  // ── Bid Requests ───────────────────────────────────────────────────────────
  Future<List<BidRequest>> getBidRequests(int projectId) async {
    final data = await _db.from('bid_requests')
        .select('*, bids(*)').eq('project_id', projectId)
        .order('created_at', ascending: false);
    return data.map((m) => BidRequest.fromMap(m)).toList();
  }

  Future<List<BidRequest>> getAllBidRequests() async {
    final data = await _db.from('bid_requests')
        .select('*, bids(*)').order('created_at', ascending: false);
    return data.map((m) => BidRequest.fromMap(m)).toList();
  }

  Future<BidRequest> createBidRequest(int projectId, String title, String? scope, DateTime? dueDate) async {
    final data = await _db.from('bid_requests').insert({
      'project_id': projectId, 'title': title, 'scope': scope,
      'due_date': dueDate?.toIso8601String().split('T').first,
    }).select().single();
    return BidRequest.fromMap(data);
  }

  Future<Bid> submitBid(int bidRequestId, String vendorName, double amount, {String? email, String? notes}) async {
    final data = await _db.from('bids').insert({
      'bid_request_id': bidRequestId, 'vendor_name': vendorName,
      'vendor_email': email, 'amount': amount, 'notes': notes,
    }).select().single();
    return Bid.fromMap(data);
  }

  Future<void> selectBid(int bidId) async {
    final bid = await _db.from('bids').select('bid_request_id').eq('id', bidId).single();
    final brId = bid['bid_request_id'];
    await _db.from('bids').update({'is_selected': false}).eq('bid_request_id', brId);
    await _db.from('bids').update({'is_selected': true}).eq('id', bidId);
    await _db.from('bid_requests').update({'status': 'awarded'}).eq('id', brId);
  }

  // ── Estimates ──────────────────────────────────────────────────────────────
  Future<List<Estimate>> getEstimates(int projectId) async {
    final data = await _db.from('estimates').select()
        .eq('project_id', projectId).order('created_at', ascending: false);
    return data.map((m) => Estimate.fromMap(m)).toList();
  }

  Future<Estimate> createEstimate(Estimate est) async {
    final map = <String, dynamic>{
      'project_id': est.projectId, 'title': est.title, 'description': est.description,
      'markup_pct': est.markupPct, 'tax_pct': est.taxPct,
    };
    if (est.createdBy != null) map['created_by'] = est.createdBy;
    final data = await _db.from('estimates').insert(map).select().single();
    return Estimate.fromMap(data);
  }

  Future<List<EstimateLineItem>> getEstimateLineItems(int estimateId) async {
    final data = await _db.from('estimate_line_items').select()
        .eq('estimate_id', estimateId).order('sort_order');
    return data.map((m) => EstimateLineItem.fromMap(m)).toList();
  }

  Future<void> addLineItem(EstimateLineItem item) async {
    await _db.from('estimate_line_items').insert(item.toInsert());
    final items = await _db.from('estimate_line_items')
        .select('total').eq('estimate_id', item.estimateId);
    final sum = items.fold<double>(0, (s, i) => s + ((i['total'] as num?)?.toDouble() ?? 0));
    await _db.from('estimates').update({'total': sum}).eq('id', item.estimateId);
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  Future<List<AppNotification>> getNotifications() async {
    final data = await _db.from('notifications').select()
        .order('created_at', ascending: false).limit(50);
    return data.map((m) => AppNotification.fromMap(m)).toList();
  }

  Future<int> getUnreadCount() async {
    final data = await _db.from('notifications').select('id').eq('is_read', false);
    return data.length;
  }

  Future<void> markNotificationRead(int id) async {
    await _db.from('notifications').update({'is_read': true}).eq('id', id);
  }

  Future<void> markAllNotificationsRead(int userId) async {
    await _db.from('notifications').update({'is_read': true}).eq('user_id', userId);
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  Future<List<AppUser>> getUsers() async {
    final data = await _db.from('users').select().order('created_at');
    return data.map((m) => AppUser.fromMap(m)).toList();
  }

  Future<AppUser?> getUserByEmail(String email) async {
    final data = await _db.from('users').select().eq('email', email).maybeSingle();
    return data != null ? AppUser.fromMap(data) : null;
  }

  Future<void> createUserRow(AppUser user) async {
    await _db.from('users').insert(user.toMap());
  }

  // ── Dashboard Stats ────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getDashboardStats() async {
    final projects = await _db.from('projects').select('id, status, budget');
    final cos = await _db.from('change_orders').select('id').eq('status', 'pending');
    final bids = await _db.from('bid_requests').select('id').eq('status', 'open');
    final today = DateTime.now().toIso8601String().split('T').first;
    final time = await _db.from('time_entries').select('hours').eq('date', today);

    final active = projects.where((p) => p['status'] == 'active').length;
    final totalBudget = projects
        .where((p) => p['status'] == 'active' || p['status'] == 'planning')
        .fold<double>(0, (s, p) => s + ((p['budget'] as num?)?.toDouble() ?? 0));
    final todayHours = time.fold<double>(0, (s, t) => s + ((t['hours'] as num?)?.toDouble() ?? 0));

    return {
      'activeProjects': active,
      'totalProjects': projects.length,
      'totalBudget': totalBudget,
      'pendingCOs': cos.length,
      'openBids': bids.length,
      'todayHours': todayHours,
    };
  }
}
