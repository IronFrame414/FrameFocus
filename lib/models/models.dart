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
    clientId: m['client_id'],
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
    'project_id': projectId, 'co_number': coNumber,
