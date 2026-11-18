import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppShell from './AppShell'
import RequireAuth from './RequireAuth'
import LoginPage from '@/features/auth/LoginPage'
import ResetPasswordPage from '@/features/auth/ResetPasswordPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import ProductsPage from '@/features/products/ProductsPage'
import ProductFormPage from '@/features/products/ProductFormPage'
import CategoriesPage from '@/features/categories/CategoriesPage'
import AttributesPage from '@/features/attributes/AttributesPage'
import InventoryPage from '@/features/inventory/InventoryPage'
import SalesPage from '@/features/sales/SalesPage'
import NewSalePage from '@/features/sales/NewSalePage'
import SaleDetailPage from '@/features/sales/SaleDetailPage'
import CustomersPage from '@/features/customers/CustomersPage'
import ReportsPage from '@/features/reports/ReportsPage'
import AdminPage from '@/features/admin/AdminPage'
import UsersPage from '@/features/admin/UsersPage'
import BranchesPage from '@/features/admin/BranchesPage'
import SettingsPage from '@/features/admin/SettingsPage'
import AuditLogPage from '@/features/admin/AuditLogPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'products/new', element: <ProductFormPage /> },
          { path: 'products/:productId', element: <ProductFormPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'sales', element: <SalesPage /> },
          { path: 'sales/new', element: <NewSalePage /> },
          { path: 'sales/:saleId', element: <SaleDetailPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'reports', element: <RequireAuth role="OWNER" />, children: [{ index: true, element: <ReportsPage /> }] },
          {
            path: 'admin',
            element: <RequireAuth role="OWNER" />,
            children: [
              { index: true, element: <AdminPage /> },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'attributes', element: <AttributesPage /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'branches', element: <BranchesPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'audit', element: <AuditLogPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
