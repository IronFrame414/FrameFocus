import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isLogin = true;
  bool _loading = false;
  String? _error;
  final _emailC = TextEditingController();
  final _passC = TextEditingController();
  final _nameC = TextEditingController();
  String _role = 'employee';

  Future<void> _submit() async {
    if (_emailC.text.isEmpty || _passC.text.isEmpty) {
      setState(() => _error = 'Email and password are required');
      return;
    }
    if (!_isLogin && _nameC.text.isEmpty) {
      setState(() => _error = 'Full name is required');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final auth = context.read<AuthService>();
      if (_isLogin) {
        await auth.signIn(_emailC.text.trim(), _passC.text);
      } else {
        await auth.signUp(_emailC.text.trim(), _passC.text, _nameC.text.trim(), _role);
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceAll('AuthException:', '').trim());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.primary,
    body: Center(child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 24)],
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('FrameFocus', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.primary, letterSpacing: 1)),
          const Text('CONSTRUCTION PLATFORM', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 3, color: AppColors.textMuted)),
          const SizedBox(height: 32),

          if (_error != null) Container(
            padding: const EdgeInsets.all(12), margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(color: AppColors.errorLight, borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              const Icon(Icons.error_outline, size: 18, color: AppColors.error),
              const SizedBox(width: 8),
              Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.error))),
            ]),
          ),

          if (!_isLogin) ...[
            TextField(controller: _nameC, decoration: const InputDecoration(labelText: 'Full Name', prefixIcon: Icon(Icons.person_outline))),
            const SizedBox(height: 12),
          ],
          TextField(controller: _emailC, keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email_outlined))),
          const SizedBox(height: 12),
          TextField(controller: _passC, obscureText: true,
            decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outlined)),
            onSubmitted: (_) => _submit()),
          if (!_isLogin) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _role,
              decoration: const InputDecoration(labelText: 'Role', prefixIcon: Icon(Icons.badge_outlined)),
              items: const [
                DropdownMenuItem(value: 'employee', child: Text('Employee')),
                DropdownMenuItem(value: 'foreman', child: Text('Foreman')),
                DropdownMenuItem(value: 'owner', child: Text('Owner')),
                DropdownMenuItem(value: 'viewer', child: Text('Viewer / Client')),
              ],
              onChanged: (v) => setState(() => _role = v!),
            ),
          ],
          const SizedBox(height: 24),
          SizedBox(width: double.infinity, height: 48, child: ElevatedButton(
            onPressed: _loading ? null : _submit,
            child: _loading
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(_isLogin ? 'Sign In' : 'Create Account'),
          )),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => setState(() { _isLogin = !_isLogin; _error = null; }),
            child: Text(_isLogin ? 'No account? Register' : 'Have an account? Sign In'),
          ),
        ]),
      ),
    )),
  );
}
