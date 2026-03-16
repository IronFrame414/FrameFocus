import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../config/supabase_config.dart';
import '../models/models.dart';
import 'database_service.dart';

class AuthService extends ChangeNotifier {
  final _db = DatabaseService();
  AppUser? _user;
  bool _loading = true;

  AppUser? get user => _user;
  bool get isLoggedIn => _user != null;
  bool get loading => _loading;
  SupabaseClient get _auth => SupabaseConfig.client;

  AuthService() {
    _init();
  }

  Future<void> _init() async {
    _loading = true;
    notifyListeners();

    final session = _auth.auth.currentSession;
    if (session != null) {
      await _loadProfile();
    }

    _auth.auth.onAuthStateChange.listen((data) async {
      if (data.event == AuthChangeEvent.signedIn) {
        await _loadProfile();
      } else if (data.event == AuthChangeEvent.signedOut) {
        _user = null;
        notifyListeners();
      }
    });

    _loading = false;
    notifyListeners();
  }

  Future<void> _loadProfile() async {
    final authUser = _auth.auth.currentUser;
    if (authUser == null) return;
    try {
      _user = await _db.getUserByEmail(authUser.email!);
      _user ??= AppUser(email: authUser.email!, fullName: authUser.email!.split('@').first);
    } catch (e) {
      debugPrint('Profile load error: $e');
    }
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    await _auth.auth.signInWithPassword(email: email, password: password);
    await _loadProfile();
  }

  Future<void> signUp(String email, String password, String fullName, String role) async {
    await _auth.auth.signUp(email: email, password: password);
    try {
      await _db.createUserRow(AppUser(email: email, fullName: fullName, role: role));
    } catch (e) {
      debugPrint('User row insert: $e');
    }
    await _loadProfile();
  }

  Future<void> signOut() async {
    await _auth.auth.signOut();
    _user = null;
    notifyListeners();
  }

  Future<void> refresh() async {
    await _loadProfile();
  }
}
