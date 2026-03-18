// ═══════════════════════════════════════════════════════════════════════════════
//  FrameFocus — Data Models
// ═══════════════════════════════════════════════════════════════════════════════

class AppUser {
  final int? id;
  final String email;
  final String fullName;
  final String role;
  final String? phone;
  final String? company;
  final String? avatarUrl;
  final bool isActive;
  final DateTime? createdAt;

  AppUser({
    this.id, required this.email, required this.fullName, this.role = 'employee',
    this.phone, this.company, this.avatarUrl, this.isActive = true, this.createdAt,
  });

  factory AppUser.fromMap(Map<String, dynamic> m) => AppUser(
    id: m['id'], email: m['email'] ?? '', fullName: m['full_name'] ?? '',
    role: m['role'] ?? 'employee', phone: m['phone'], company: m['company'],
    avatarUrl: m['avatar_url'], isActive: m['is_active'] ?? true,
    createdAt: m['created_at'] != null ? DateTime.tryParse(m['created_at']) : null,
  );

  Map<String, dynamic> toMap() => {
    'email': email, 'full_name': fullName, 'role': role,
    'phone': phone, 'company': company, 'avatar_url': avatarUrl,
    'is_active': isActive, 'password_hash': '(managed-by-supabase-auth)',
  };

  String get initials {
    final parts = fullName.split(' ');
    if (parts.length >= 2) return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    return fullName.isNotEmpty ? fullName[0].toUpperCase() : '?';
  }

  bool get isAdmin => role == 'admin' || role == 'owner';
  bool get isForeman => role == 'foreman';
  bool get canApprove => isAdmin;
  bool get canCreateProjects => isAdmin;
  bool get canManageCatalog => isAdmin;
}

class Project {
  final int? id;
  final String name;
  final String? description;
  final String status;
  final String? address, city, state, zip;
  final double? lat, lng;
  final DateTime? startDate, endDate;
  final double budget;
  final int? ownerId;
  final String? ownerName;
  final String? clientId;
  final DateTime? createdAt, updatedAt;

Project({
    this.id, required this.name, this.description, this.status = 'planning',
    this.address, this.city, this.state, this.zip, this.lat, this.lng,
    this.startDate, this.endDate, this.budget = 0, this.ownerId,
    this.ownerName, this.clientId, this.createdAt, this.updatedAt,
  });
  });

  factory Project.fromMap(Map<String, dynamic> m) => Project(
    id: m['id'], name: m['name'] ?? '', description: m['description'],
    status: m['status'] ?? 'planning',
    address: m['address'], city: m['city'], state: m['state'], zip: m['zip'],
    lat: (m['lat'] as num?)?.toDouble(), lng: (m['lng'] as num?)?.toDouble(),
    startDate: m['start_date'] != null ? DateTime.tryParse(m['start_date']) : null,
    endDate: m['end_date'] != null ? DateTime.tryParse(m['end_date']) : null,
    budget: (m['budget'] as num?)?.toDouble() ?? 0,
    ownerId: m['owner_id'],
    ownerName: m['users'] is Map ? m['users']['full_name'] : null,
    createdAt: m['created_at'] != null ? DateTime.tryParse(m['created_at']) : null,
    updatedAt: m['updated_at'] != null ? DateTime.tryParse(m['updated_at']) : null,
  );

  Map<String, dynamic> toMap() => {
    'name': name, 'description': description, 'status': status,
    'address': address, 'city': city, 'state': state, 'zip': zip,
    'lat': lat, 'lng': lng,
    'start_date': startDate?.toIso8601String().split('T').first,
    'end_date': endDate?.toIso8601String().split('T').first,
    'budget': budget, 'owner_id': ownerId, 'client_id': clientId,
  };

  String get location {
    final parts = [city, state].where((s) => s != null && s.isNotEmpty);
    return parts.join(', ');
  }

  double get progress {
    if (startDate == null || endDate == null) return 0;
    final total = endDate!.difference(startDate!).inDays;
    if (total <= 0) return 0;
    final elapsed = DateTime.now().difference(startDate!).inDays;
    return (elapsed / total).clamp(0.0, 1.0);
  }
}

class ChangeOrder {
  final int? id;
  final int projectId;
  final int coNumber;
  final String title;
  final String? description;
  final String status;
  final double amount;
  final int? requestedBy;
  final int? approvedBy;
  final DateTime? approvedAt;
  final DateTime? createdAt;
  final String? requestedByName;
  final String? projectName;

  ChangeOrder({
    this.id, required this.projectId, required this.coNumber, required this.title,
    this.description, this.status = 'pending', this.amount = 0,
    this.requestedBy, this.approvedBy, this.approvedAt, this.createdAt,
    this.requestedByName, this.projectName,
  });

  factory ChangeOrder.fromMap(Map<String, dynamic> m) => ChangeOrder(
    id: m['id'], projectId: m['project_id'] ?? 0, coNumber: m['co_number'] ?? 0,
    title: m['title'] ?? '', description: m['description'],
    status: m['status'] ?? 'pending', amount: (m['amount'] as num?)?.toDouble() ?? 0,
    requestedBy: m['requested_by'], approvedBy: m['approved_by'],
    approvedAt: m['approved_at'] != null ? DateTime.tryParse(m['approved_at']) : null,
    createdAt: m['created_at'] != null ? DateTime.tryParse(m['created_at']) : null,
    requestedByName: m['users'] is Map ? m['users']['full_name'] : null,
  );

  Map<String, dynamic> toInsert() => {
    'project_id': projectId, 'co_number': coNumber, 'title': title,
    'description': description, 'amount': amount, 'requested_by': requestedBy,
  };
}

class CatalogItem {
  final int? id;
  final String? code;
  final String name;
  final String? category, subcategory;
  final String unit;
  final double unitCost, laborCost;
  final String? description;
  final bool isActive;

  CatalogItem({
    this.id, this.code, required this.name, this.category, this.subcategory,
    this.unit = 'ea', this.unitCost = 0, this.laborCost = 0,
    this.description, this.isActive = true,
  });

  factory CatalogItem.fromMap(Map<String, dynamic> m) => CatalogItem(
    id: m['id'], code: m['code'], name: m['name'] ?? '',
    category: m['category'], subcategory: m['subcategory'],
    unit: m['unit'] ?? 'ea',
    unitCost: (m['unit_cost'] as num?)?.toDouble() ?? 0,
    laborCost: (m['labor_cost'] as num?)?.toDouble() ?? 0,
    description: m['description'], isActive: m['is_active'] ?? true,
  );

  Map<String, dynamic> toMap() => {
    'code': code, 'name': name, 'category': category, 'subcategory': subcategory,
    'unit': unit, 'unit_cost': unitCost, 'labor_cost': laborCost,
    'description': description, 'is_active': isActive,
  };

  double get totalCost => unitCost + laborCost;
}

class TimeEntry {
  final int? id;
  final int projectId;
  final int? userId;
  final DateTime date;
  final double hours;
  final String? description, costCode;
  final bool isOvertime, approved;
  final int? approvedBy;
  final String? userName, projectName;

  TimeEntry({
    this.id, required this.projectId, this.userId, required this.date,
    required this.hours, this.description, this.costCode,
    this.isOvertime = false, this.approved = false, this.approvedBy,
    this.userName, this.projectName,
  });

  factory TimeEntry.fromMap(Map<String, dynamic> m) => TimeEntry(
    id: m['id'], projectId: m['project_id'] ?? 0, userId: m['user_id'],
    date: DateTime.tryParse(m['date'] ?? '') ?? DateTime.now(),
    hours: (m['hours'] as num?)?.toDouble() ?? 0,
    description: m['description'], costCode: m['cost_code'],
    isOvertime: m['is_overtime'] ?? false, approved: m['approved'] ?? false,
    approvedBy: m['approved_by'],
    userName: m['users'] is Map ? m['users']['full_name'] : null,
  );

  Map<String, dynamic> toInsert() => {
    'project_id': projectId, 'user_id': userId,
    'date': date.toIso8601String().split('T').first,
    'hours': hours, 'description': description, 'cost_code': costCode,
    'is_overtime': isOvertime,
  };
}

class DailyLog {
  final int? id;
  final int projectId;
  final DateTime date;
  final String? weather;
  final double? tempHigh, tempLow;
  final String? wind;
  final int crewCount;
  final String? summary, safetyNotes, delays, visitors;
  final int? createdBy;
  final String? authorName, projectName;

  DailyLog({
    this.id, required this.projectId, required this.date, this.weather,
    this.tempHigh, this.tempLow, this.wind, this.crewCount = 0,
    this.summary, this.safetyNotes, this.delays, this.visitors,
    this.createdBy, this.authorName, this.projectName,
  });

  factory DailyLog.fromMap(Map<String, dynamic> m) => DailyLog(
    id: m['id'], projectId: m['project_id'] ?? 0,
    date: DateTime.tryParse(m['date'] ?? '') ?? DateTime.now(),
    weather: m['weather'],
    tempHigh: (m['temp_high'] as num?)?.toDouble(),
    tempLow: (m['temp_low'] as num?)?.toDouble(),
    wind: m['wind'], crewCount: m['crew_count'] ?? 0,
    summary: m['summary'], safetyNotes: m['safety_notes'],
    delays: m['delays'], visitors: m['visitors'], createdBy: m['created_by'],
    authorName: m['users'] is Map ? m['users']['full_name'] : null,
  );

  Map<String, dynamic> toInsert() => {
    'project_id': projectId, 'date': date.toIso8601String().split('T').first,
    'weather': weather, 'temp_high': tempHigh, 'temp_low': tempLow,
    'wind': wind, 'crew_count': crewCount, 'summary': summary,
    'safety_notes': safetyNotes, 'delays': delays, 'visitors': visitors,
    'created_by': createdBy,
  };
}

class BidRequest {
  final int? id;
  final int projectId;
  final String title;
  final String? scope;
  final String status;
  final DateTime? dueDate;
  final int? createdBy;
  final DateTime? createdAt;
  final List<Bid> bids;
  final String? projectName;

  BidRequest({
    this.id, required this.projectId, required this.title, this.scope,
    this.status = 'open', this.dueDate, this.createdBy, this.createdAt,
    this.bids = const [], this.projectName,
  });

  factory BidRequest.fromMap(Map<String, dynamic> m) => BidRequest(
    id: m['id'], projectId: m['project_id'] ?? 0, title: m['title'] ?? '',
    scope: m['scope'], status: m['status'] ?? 'open',
    dueDate: m['due_date'] != null ? DateTime.tryParse(m['due_date']) : null,
    createdBy: m['created_by'],
    createdAt: m['created_at'] != null ? DateTime.tryParse(m['created_at']) : null,
    bids: (m['bids'] as List?)?.map((b) => Bid.fromMap(b)).toList() ?? [],
  );
}

class Bid {
  final int? id;
  final int bidRequestId;
  final String vendorName;
  final String? vendorEmail;
  final double? amount;
  final String? notes, filePath;
  final bool isSelected;

  Bid({
    this.id, required this.bidRequestId, required this.vendorName,
    this.vendorEmail, this.amount, this.notes, this.filePath,
    this.isSelected = false,
  });

  factory Bid.fromMap(Map<String, dynamic> m) => Bid(
    id: m['id'], bidRequestId: m['bid_request_id'] ?? 0,
    vendorName: m['vendor_name'] ?? '', vendorEmail: m['vendor_email'],
    amount: (m['amount'] as num?)?.toDouble(), notes: m['notes'],
    filePath: m['file_path'], isSelected: m['is_selected'] ?? false,
  );
}

class Estimate {
  final int? id;
  final int projectId;
  final String title;
  final String? description;
  final String status;
  final double total, markupPct, taxPct;
  final int? createdBy;

  Estimate({
    this.id, required this.projectId, required this.title, this.description,
    this.status = 'draft', this.total = 0, this.markupPct = 0,
    this.taxPct = 0, this.createdBy,
  });

  factory Estimate.fromMap(Map<String, dynamic> m) => Estimate(
    id: m['id'], projectId: m['project_id'] ?? 0, title: m['title'] ?? '',
    description: m['description'], status: m['status'] ?? 'draft',
    total: (m['total'] as num?)?.toDouble() ?? 0,
    markupPct: (m['markup_pct'] as num?)?.toDouble() ?? 0,
    taxPct: (m['tax_pct'] as num?)?.toDouble() ?? 0,
    createdBy: m['created_by'],
  );
}

class EstimateLineItem {
  final int? id;
  final int estimateId;
  final String? category;
  final String description;
  final double quantity;
  final String unit;
  final double unitCost;
  final double? total;
  final int sortOrder;

  EstimateLineItem({
    this.id, required this.estimateId, this.category, required this.description,
    this.quantity = 1, this.unit = 'ea', this.unitCost = 0,
    this.total, this.sortOrder = 0,
  });

  factory EstimateLineItem.fromMap(Map<String, dynamic> m) => EstimateLineItem(
    id: m['id'], estimateId: m['estimate_id'] ?? 0, category: m['category'],
    description: m['description'] ?? '', quantity: (m['quantity'] as num?)?.toDouble() ?? 1,
    unit: m['unit'] ?? 'ea', unitCost: (m['unit_cost'] as num?)?.toDouble() ?? 0,
    total: (m['total'] as num?)?.toDouble(), sortOrder: m['sort_order'] ?? 0,
  );

  Map<String, dynamic> toInsert() => {
    'estimate_id': estimateId, 'category': category, 'description': description,
    'quantity': quantity, 'unit': unit, 'unit_cost': unitCost, 'sort_order': sortOrder,
  };
}

class AppNotification {
  final int? id;
  final int? userId;
  final String type;
  final String title;
  final String? body, link;
  final bool isRead;
  final DateTime? createdAt;

  AppNotification({
    this.id, this.userId, required this.type, required this.title,
    this.body, this.link, this.isRead = false, this.createdAt,
  });

  factory AppNotification.fromMap(Map<String, dynamic> m) => AppNotification(
    id: m['id'], userId: m['user_id'], type: m['type'] ?? '',
    title: m['title'] ?? '', body: m['body'], link: m['link'],
    isRead: m['is_read'] ?? false,
    createdAt: m['created_at'] != null ? DateTime.tryParse(m['created_at']) : null,
  );
}
