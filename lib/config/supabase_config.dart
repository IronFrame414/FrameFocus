import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  static const String url = 'https://dbmjqetqtgbfaljlhbzj.supabase.co';
  static const String anonKey = 'sb_publishable_Do2kWRRwvqGfmT8QBXu7bw_UR9OutiG';

  static SupabaseClient get client => Supabase.instance.client;

  static Future<void> initialize() async {
    await Supabase.initialize(url: url, anonKey: anonKey);
  }
}
