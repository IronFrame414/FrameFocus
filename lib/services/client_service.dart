import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/client.dart';

class ClientService {
  final _supabase = Supabase.instance.client;

  Future<String> _getCompanyId() async {
    final profile = await _supabase
        .from('profiles')
        .select('company_id')
        .eq('id', _supabase.auth.currentUser!.id)
        .single();
    return profile['company_id'] as String;
  }

  Future<List<Client>> getClients() async {
    final response = await _supabase
        .from('clients')
        .select()
        .isFilter('deleted_at', null)
        .order('name', ascending: true);

    return (response as List).map((json) => Client.fromJson(json)).toList();
  }

  Future<Client> getClient(String id) async {
    final response = await _supabase
        .from('clients')
        .select()
        .eq('id', id)
        .single();

    return Client.fromJson(response);
  }

  Future<Client> createClient(Client client) async {
    final companyId = await _getCompanyId();

    final response = await _supabase
        .from('clients')
        .insert({
          ...client.toJson(),
          'company_id': companyId,
        })
        .select()
        .single();

    return Client.fromJson(response);
  }

  Future<Client> updateClient(String id, Client client) async {
    final response = await _supabase
        .from('clients')
        .update(client.toJson())
        .eq('id', id)
        .select()
        .single();

    return Client.fromJson(response);
  }

  Future<void> deleteClient(String id) async {
    await _supabase
        .from('clients')
        .update({'deleted_at': DateTime.now().toIso8601String()})
        .eq('id', id);
  }
}
