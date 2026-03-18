import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/client.dart';

class ClientService {
  final _supabase = Supabase.instance.client;

  // Get all active clients for this company
  Future<List<Client>> getClients() async {
    final response = await _supabase
        .from('clients')
        .select()
        .isFilter('deleted_at', null)
        .order('name', ascending: true);

    return (response as List).map((json) => Client.fromJson(json)).toList();
  }

  // Get a single client by ID
  Future<Client> getClient(String id) async {
    final response = await _supabase
        .from('clients')
        .select()
        .eq('id', id)
        .single();

    return Client.fromJson(response);
  }

  // Create a new client
  Future<Client> createClient(Client client) async {
    final response = await _supabase
        .from('clients')
        .insert({
          ...client.toJson(),
          'company_id': _supabase.auth.currentUser!.id,
        })
        .select()
        .single();

    return Client.fromJson(response);
  }

  // Update an existing client
  Future<Client> updateClient(String id, Client client) async {
    final response = await _supabase
        .from('clients')
        .update(client.toJson())
        .eq('id', id)
        .select()
        .single();

    return Client.fromJson(response);
  }

  // Soft delete a client
  Future<void> deleteClient(String id) async {
    await _supabase
        .from('clients')
        .update({'deleted_at': DateTime.now().toIso8601String()})
        .eq('id', id);
  }
}
