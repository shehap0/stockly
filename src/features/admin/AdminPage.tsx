import { Link } from 'react-router-dom'

export default function AdminPage() {
  return (
    <section>
      <h2>Admin</h2>
      <p>Owner-only management.</p>
      <ul>
        <li><Link to="/admin/categories">Product categories</Link></li>
        <li><Link to="/admin/attributes">Product attributes</Link></li>
        <li><Link to="/admin/users">Users & branch access</Link></li>
        <li><Link to="/admin/branches">Branches</Link></li>
        <li><Link to="/admin/settings">Company settings</Link></li>
        <li><Link to="/admin/audit">Audit log</Link></li>
      </ul>
    </section>
  )
}
