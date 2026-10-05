import { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, Users } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import { formatDate } from '../utils/helpers';

const ITEMS_PER_PAGE = 8;

const initialCustomers = [
  { id: 1, name: 'PT Maju Bersama', email: 'contact@majubersama.co.id', phone: '+62 21 1234 5678', status: 'Active', created: '2024-01-15', totalOrders: 45, totalSpent: 'Rp 250M' },
  { id: 2, name: 'CV Teknologi Nusantara', email: 'info@teknusantara.com', phone: '+62 21 8765 4321', status: 'Active', created: '2024-02-20', totalOrders: 32, totalSpent: 'Rp 180M' },
  { id: 3, name: 'PT Global Solutions', email: 'hello@globalsolutions.id', phone: '+62 21 5555 1234', status: 'Inactive', created: '2024-03-10', totalOrders: 18, totalSpent: 'Rp 95M' },
  { id: 4, name: 'UD Berkah Jaya', email: 'berkahjaya@gmail.com', phone: '+62 21 9999 8888', status: 'Active', created: '2024-04-05', totalOrders: 67, totalSpent: 'Rp 420M' },
  { id: 5, name: 'PT Sinar Abadi', email: 'admin@sinarabadi.co.id', phone: '+62 21 7777 6666', status: 'Pending', created: '2024-05-12', totalOrders: 12, totalSpent: 'Rp 55M' },
  { id: 6, name: 'CV Mitra Sejahtera', email: 'mitrasejahtera@yahoo.com', phone: '+62 21 4444 3333', status: 'Active', created: '2024-06-18', totalOrders: 28, totalSpent: 'Rp 150M' },
  { id: 7, name: 'PT Karya Mandiri', email: 'info@karyamandiri.com', phone: '+62 21 2222 1111', status: 'Active', created: '2024-07-22', totalOrders: 41, totalSpent: 'Rp 210M' },
  { id: 8, name: 'UD Sumber Rezeki', email: 'sumberrezeki@gmail.com', phone: '+62 21 3333 4444', status: 'Inactive', created: '2024-08-30', totalOrders: 8, totalSpent: 'Rp 35M' },
  { id: 9, name: 'PT Bina Kreatif', email: 'contact@binakreatif.id', phone: '+62 21 6666 5555', status: 'Active', created: '2024-09-14', totalOrders: 53, totalSpent: 'Rp 310M' },
  { id: 10, name: 'CV Jaya Abadi', email: 'jayabadi@gmail.com', phone: '+62 21 8888 9999', status: 'Pending', created: '2024-10-08', totalOrders: 15, totalSpent: 'Rp 75M' },
  { id: 11, name: 'PT Sentosa Prima', email: 'info@sentosaprima.com', phone: '+62 21 1212 3434', status: 'Active', created: '2024-11-01', totalOrders: 38, totalSpent: 'Rp 195M' },
  { id: 12, name: 'UD Makmur Sentosa', email: 'makmursentosa@gmail.com', phone: '+62 21 5656 7878', status: 'Active', created: '2024-11-15', totalOrders: 22, totalSpent: 'Rp 110M' },
];

const statusVariant = {
  Active: 'success',
  Inactive: 'default',
  Pending: 'warning',
};

export default function Customers() {
  const [customers, setCustomers] = useState(initialCustomers);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [modalState, setModalState] = useState({ type: null, isOpen: false });
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, customer: null });
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', status: 'Pending' });
  const [formErrors, setFormErrors] = useState({});

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = !statusFilter || customer.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const openModal = (type, customer = null) => {
    if (type === 'add') {
      setFormData({ name: '', email: '', phone: '', status: 'Pending' });
    } else if (type === 'edit' && customer) {
      setFormData({ name: customer.name, email: customer.email, phone: customer.phone, status: customer.status });
    }
    setSelectedCustomer(customer);
    setFormErrors({});
    setModalState({ type, isOpen: true });
  };

  const closeModal = () => {
    setModalState({ type: null, isOpen: false });
    setSelectedCustomer(null);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (modalState.type === 'add') {
      const newCustomer = {
        id: Math.max(...customers.map((c) => c.id)) + 1,
        ...formData,
        created: new Date().toISOString().split('T')[0],
        totalOrders: 0,
        totalSpent: 'Rp 0',
      };
      setCustomers([newCustomer, ...customers]);
    } else if (modalState.type === 'edit') {
      setCustomers(customers.map((c) => (c.id === selectedCustomer.id ? { ...c, ...formData } : c)));
    }
    closeModal();
  };

  const handleDelete = () => {
    setCustomers(customers.filter((c) => c.id !== deleteConfirm.customer.id));
    setDeleteConfirm({ isOpen: false, customer: null });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Customers</h2>
          <p className="text-text-secondary mt-1">Manage your customer relationships</p>
        </div>
        <Button icon={Plus} onClick={() => openModal('add')}>Add Customer</Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="w-40"
          >
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Pending">Pending</option>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden !p-0">
        {paginatedCustomers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers found"
            description="Try adjusting your search or filter criteria"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50/50">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Customer</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Contact</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Orders</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Total Spent</th>
                    <th className="text-right py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <Avatar name={customer.name} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-text-primary">{customer.name}</p>
                            <p className="text-xs text-text-muted">Since {formatDate(customer.created)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm text-text-primary">{customer.email}</p>
                        <p className="text-xs text-text-muted">{customer.phone}</p>
                      </td>
                      <td className="py-4 px-6">
                        <Badge variant={statusVariant[customer.status]} dot>{customer.status}</Badge>
                      </td>
                      <td className="py-4 px-6 text-sm text-text-secondary">{customer.totalOrders}</td>
                      <td className="py-4 px-6 text-sm font-medium text-text-primary">{customer.totalSpent}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setSelectedCustomer(customer); setModalState({ type: 'view', isOpen: true }); }}
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openModal('edit', customer)}
                            className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ isOpen: true, customer })}
                            className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-border">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredCustomers.length}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            </div>
          </>
        )}
      </Card>

      {/* View/Add/Edit Modal */}
      <Modal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={
          modalState.type === 'add' ? 'Add New Customer' :
          modalState.type === 'edit' ? 'Edit Customer' :
          'Customer Details'
        }
        size="md"
      >
        {modalState.type === 'view' && selectedCustomer ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar name={selectedCustomer.name} size="xl" />
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{selectedCustomer.name}</h3>
                <p className="text-text-secondary">{selectedCustomer.email}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant={statusVariant[selectedCustomer.status]} dot>{selectedCustomer.status}</Badge>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Phone</p>
                <p className="text-sm font-medium text-text-primary">{selectedCustomer.phone}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Customer Since</p>
                <p className="text-sm font-medium text-text-primary">{formatDate(selectedCustomer.created)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Total Orders</p>
                <p className="text-sm font-medium text-text-primary">{selectedCustomer.totalOrders}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Total Spent</p>
                <p className="text-sm font-medium text-text-primary">{selectedCustomer.totalSpent}</p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Company Name"
              placeholder="Enter company name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={formErrors.name}
            />
            <Input
              label="Email Address"
              type="email"
              placeholder="Enter email address"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={formErrors.email}
            />
            <Input
              label="Phone Number"
              placeholder="Enter phone number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Pending">Pending</option>
            </Select>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                {modalState.type === 'add' ? 'Add Customer' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, customer: null })}
        onConfirm={handleDelete}
        title="Delete Customer"
        message={`Are you sure you want to delete ${deleteConfirm.customer?.name}? This action cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
