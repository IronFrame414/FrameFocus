class Client {
  final String id;
  final String companyId;
  final String name;
  final String? email;
  final String? phone;
  final String? address;
  final String type;
  final DateTime createdAt;

  Client({
    required this.id,
    required this.companyId,
    required this.name,
    this.email,
    this.phone,
    this.address,
    required this.type,
    required this.createdAt,
  });

  factory Client.fromJson(Map<String, dynamic> json) {
    return Client(
      id:        json['id'],
      companyId: json['company_id'],
      name:      json['name'],
      email:     json['email'],
      phone:     json['phone'],
      address:   json['address'],
      type:      json['type'],
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'company_id': companyId,
      'name':       name,
      'email':      email,
      'phone':      phone,
      'address':    address,
      'type':       type,
    };
  }
}
