import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../services/auth_service.dart';
import 'dashboard_screen.dart';
import 'projects_screen.dart';
import 'change_orders_screen.dart';
import 'catalog_screen.dart';
import 'time_tracking_screen.dart';
import 'bid_requests_screen.dart';
import 'daily_log_screen.dart';
import 'estimating_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  static const _navItems = [
    _NavItem(Icons.dashboard_rounded, 'Dashboard'),
    _NavItem(Icons.folder_rounded, 'Projects'),
    _NavItem(Icons.calendar_today_rounded, 'Daily Logs'),
    _NavItem(Icons.people_rounded, 'Time Tracking'),
    _NavItem(Icons.calculate_rounded, 'Estimating'),
    _NavItem(Icons.receipt_long_rounded, 'Change Orders'),
    _NavItem(Icons.gavel_rounded, 'Bid Requests'),
    _NavItem(Icons.inventory_2_rounded, 'Cost Catalog'),
  ];

  Widget _buildScreen() => switch (_selectedIndex) {
    0 => DashboardScreen(onNavigate: (i) => setState(() => _selectedIndex = i)),
    1 => const ProjectsScreen(),
    2 => const DailyLogScreen(),
    3 => const TimeTrackingScreen(),
    4 => const EstimatingScreen(),
    5 => const ChangeOrdersScreen(),
    6 => const BidRequestsScreen(),
    7 => const CatalogScreen(),
    _ => const DashboardScreen(),
  };

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final user = auth.user;
    final isWide = MediaQuery.of(context).size.width > 768;

    return Scaffold(
      body: Row(children: [
        // Sidebar
        if (isWide) Container(
          width: 240,
          color: AppColors.sidebar,
          child: Column(children: [
            // Logo - stacked layout
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('FrameFocus', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 0.5)),
                const SizedBox(height: 2),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text('CONSTRUCTION PLATFORM', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 2.5, color: AppColors.accent)),
                ),
              ]),
            ),

            const Divider(color: Color(0xFF1A3A5C), height: 1),

            // Nav items
            Expanded(child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: _navItems.length,
              itemBuilder: (ctx, i) {
                final item = _navItems[i];
                final active = i == _selectedIndex;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Material(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => setState(() => _selectedIndex = i),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                        decoration: active ? BoxDecoration(
                          color: AppColors.sidebarActive.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ) : null,
                        child: Row(children: [
                          Container(
                            width: 4, height: 20,
                            margin: const EdgeInsets.only(right: 10),
                            decoration: BoxDecoration(
                              color: active ? AppColors.sidebarTextActive : Colors.transparent,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          Icon(item.icon, size: 18, color: active ? AppColors.sidebarTextActive : AppColors.sidebarText),
                          const SizedBox(width: 12),
                          Text(item.label, style: TextStyle(
                            fontSize: 13, fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                            color: active ? AppColors.sidebarTextActive : AppColors.sidebarText,
                          )),
                        ]),
                      ),
                    ),
                  ),
                );
              },
            )),

            // User profile at bottom
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFF1A3A5C)))),
              child: Row(children: [
                CircleAvatar(
                  radius: 18, backgroundColor: AppColors.accent,
                  child: Text(user?.initials ?? '?', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(user?.fullName ?? 'User', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                  Text(user?.role.replaceAll('_', ' ') ?? '', style: const TextStyle(color: AppColors.sidebarText, fontSize: 11)),
                ])),
                IconButton(
                  icon: const Icon(Icons.logout_rounded, size: 18, color: AppColors.sidebarText),
                  onPressed: () => auth.signOut(),
                  tooltip: 'Sign Out',
                ),
              ]),
            ),
          ]),
        ),

        // Main Content
        Expanded(child: _buildScreen()),
      ]),

      // Mobile bottom nav
      bottomNavigationBar: isWide ? null : NavigationBar(
        selectedIndex: _selectedIndex.clamp(0, 4),
        onDestinationSelected: (i) => setState(() => _selectedIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_rounded), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.folder_rounded), label: 'Projects'),
          NavigationDestination(icon: Icon(Icons.access_time_rounded), label: 'Time'),
          NavigationDestination(icon: Icon(Icons.calculate_rounded), label: 'Estimate'),
          NavigationDestination(icon: Icon(Icons.more_horiz_rounded), label: 'More'),
        ],
      ),
    );
  }
}

class _NavItem {
  final IconData icon;
  final String label;
  const _NavItem(this.icon, this.label);
}
