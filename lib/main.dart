import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/supabase_config.dart';
import 'config/theme.dart';
import 'services/auth_service.dart';
import 'screens/auth_screen.dart';
import 'screens/app_shell.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SupabaseConfig.initialize();
  runApp(const FrameFocusApp());
}

class FrameFocusApp extends StatelessWidget {
  const FrameFocusApp({super.key});

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider(
    create: (_) => AuthService(),
    child: MaterialApp(
      title: 'FrameFocus',
      theme: AppTheme.light,
      debugShowCheckedModeBanner: false,
      home: Consumer<AuthService>(
        builder: (context, auth, _) {
          if (auth.loading) {
            return const Scaffold(
              backgroundColor: AppColors.primary,
              body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('FrameFocus', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 1)),
                Text('PRO PLATFORM', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 4, color: AppColors.sidebarText)),
                SizedBox(height: 32),
                CircularProgressIndicator(color: AppColors.accent),
              ])),
            );
          }
          return auth.isLoggedIn ? const AppShell() : const AuthScreen();
        },
      ),
    ),
  );
}
