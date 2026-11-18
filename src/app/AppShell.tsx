import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { signOut } from '@/features/auth/api'
import { roleLabel } from '@/lib/money'
import { useBranches } from '@/features/branches/api'
import { PreferenceControls } from '@/lib/preferences'
import { usePreferences } from '@/lib/usePreferences'
import dashboardIcon from '../../icons/dashboard.png'
import inventoryIcon from '../../icons/inventory.png'
import customerIcon from '../../icons/customer.png'
import reportIcon from '../../icons/report.png'
import productIcon from '../../icons/new-product.png'
import salesHistoryIcon from '../../icons/file.png'

export default function AppShell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: branches } = useBranches()
  const outlet = useOutlet()
  const { language, t } = usePreferences()
  const branchName = branches?.find((b) => b.id === profile?.branch_id)?.name
  const pageTitle = t(location.pathname.startsWith('/inventory') ? 'Inventory'
    : location.pathname.startsWith('/sales/new') ? 'New sale'
      : location.pathname.startsWith('/sales') ? 'Sales history'
        : location.pathname.startsWith('/products') ? 'Products'
          : location.pathname.startsWith('/customers') ? 'Customers'
            : location.pathname.startsWith('/reports') ? 'Reports'
              : location.pathname.startsWith('/admin') ? 'Administration'
                : 'Dashboard')

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (!profile) return null

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="brand-lockup"><span className="brand-mark">S</span><span className="brand-name">Stockly</span></div>
        <div className="branch-context">{profile.role === 'OWNER' ? t('All branches') : branchName ?? t('Your branch')} · {t(roleLabel(profile.role))}</div>
        <div className="nav-caption">{t('Workspace')}</div>
        <nav className="app-nav" aria-label="Main navigation">
          <NavLink to="/sales/new"><span className="nav-icon">＋</span>{t('New sale')}</NavLink>
          <NavLink to="/dashboard"><img className="nav-icon-img" src={dashboardIcon} alt="" />{t('Dashboard')}</NavLink>
          <NavLink to="/inventory"><img className="nav-icon-img" src={inventoryIcon} alt="" />{t('Inventory')}</NavLink>
          <NavLink to="/sales"><img className="nav-icon-img" src={salesHistoryIcon} alt="" />{t('Sales history')}</NavLink>
          <NavLink to="/products"><img className="nav-icon-img" src={productIcon} alt="" />{t('Products')}</NavLink>
          <NavLink to="/customers"><img className="nav-icon-img" src={customerIcon} alt="" />{t('Customers')}</NavLink>
          {profile.role === 'OWNER' && <NavLink to="/reports"><img className="nav-icon-img" src={reportIcon} alt="" />{t('Reports')}</NavLink>}
        </nav>
        {profile.role === 'OWNER' && <>
          <div className="nav-caption">{t('Manage')}</div>
          <nav className="app-nav" aria-label={t('Administration')}><NavLink to="/admin"><span className="nav-icon">⚙</span>{t('Administration')}</NavLink></nav>
        </>}
        <div className="sidebar-bottom">
          <div className="user-mini"><span className="user-avatar">{profile.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{profile.full_name}</strong><small>{t(roleLabel(profile.role))}</small></span></div>
          <button className="signout" onClick={handleSignOut}>{t('Sign out')}</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="topbar-date">{pageTitle} <span aria-hidden="true">·</span> {new Date().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-EG', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <PreferenceControls />
        </header>
        <main className="page-content">{outlet}</main>
      </div>
    </div>
  )
}
