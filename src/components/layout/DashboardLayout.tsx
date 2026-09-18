import { Outlet } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
