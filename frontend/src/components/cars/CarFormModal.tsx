import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Car } from '../../types';

interface CarFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Car>) => Promise<void>;
  editingCar?: Car | null;
  carTypeOptions: string[];
  reasonOptions: string[];
  liningTypeOptions?: string[];
}

const defaultLiningTypes = ['None', 'Rubber', 'Epoxy', 'Glass', 'Stainless Steel', 'Polyurethane'];

export default function CarFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingCar,
  carTypeOptions,
  reasonOptions,
  liningTypeOptions = defaultLiningTypes,
}: CarFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'qualification'>('basic');
  const [formData, setFormData] = useState<Partial<Car>>({
    railcarNumber: '',
    carType: '',
    commodity: '',
    customer: '',
    projectNumber: '',
    reasonsShopped: '',
    status: 'available',
    notes: '',
    lined: false,
    liningType: '',
    portfolio: '',
    fullPartialQual: '',
    performTankQual: false,
    minNoLining: null,
    minWLining: null,
    interiorLining: null,
    rule88B: null,
    safetyRelief: null,
    serviceEquipment: null,
    stubSill: null,
    tankThickness: null,
    tankQualification: null,
    scheduled: null,
  });

  // Reset form when modal opens or editingCar changes
  useEffect(() => {
    if (isOpen) {
      if (editingCar) {
        setFormData({
          ...editingCar,
          reasonsShopped: editingCar.reasonsShopped || editingCar.reasonShopped || '',
        });
      } else {
        setFormData({
          railcarNumber: '',
          carType: '',
          commodity: '',
          customer: '',
          projectNumber: '',
          reasonsShopped: '',
          status: 'available',
          notes: '',
          lined: false,
          liningType: '',
          portfolio: '',
          fullPartialQual: '',
          performTankQual: false,
          minNoLining: null,
          minWLining: null,
          interiorLining: null,
          rule88B: null,
          safetyRelief: null,
          serviceEquipment: null,
          stubSill: null,
          tankThickness: null,
          tankQualification: null,
          scheduled: null,
        });
      }
      setActiveTab('basic');
    }
  }, [isOpen, editingCar]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Failed to save railcar:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = <K extends keyof Car>(field: K, value: Car[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isTankCar = formData.carType === 'Tank Car' || formData.isTankCar;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-steel-900/50" onClick={onClose} />
        <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-steel-200">
            <h2 className="text-xl font-semibold text-steel-900">
              {editingCar ? 'Edit Railcar' : 'Add New Railcar'}
            </h2>
            <button onClick={onClose} className="text-steel-400 hover:text-steel-600">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-steel-200">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'basic'
                  ? 'text-rail-600 border-b-2 border-rail-600'
                  : 'text-steel-500 hover:text-steel-700'
              }`}
            >
              Basic Information
            </button>
            <button
              onClick={() => setActiveTab('qualification')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'qualification'
                  ? 'text-rail-600 border-b-2 border-rail-600'
                  : 'text-steel-500 hover:text-steel-700'
              }`}
            >
              Qualification Dates
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit}>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {activeTab === 'basic' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Railcar Number *</label>
                      <input
                        type="text"
                        value={formData.railcarNumber || ''}
                        onChange={(e) => updateField('railcarNumber', e.target.value)}
                        className="input"
                        placeholder="e.g., GATX123456"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Car Type *</label>
                      <select
                        value={formData.carType || ''}
                        onChange={(e) => updateField('carType', e.target.value)}
                        className="input"
                        required
                      >
                        <option value="">Select type...</option>
                        {carTypeOptions.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Customer</label>
                      <input
                        type="text"
                        value={formData.customer || ''}
                        onChange={(e) => updateField('customer', e.target.value)}
                        className="input"
                        placeholder="Customer name"
                      />
                    </div>
                    <div>
                      <label className="label">Commodity</label>
                      <input
                        type="text"
                        value={formData.commodity || ''}
                        onChange={(e) => updateField('commodity', e.target.value)}
                        className="input"
                        placeholder="e.g., Crude Oil"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Project Number</label>
                      <input
                        type="text"
                        value={formData.projectNumber || ''}
                        onChange={(e) => updateField('projectNumber', e.target.value)}
                        className="input"
                        placeholder="e.g., PRJ-2025-001"
                      />
                    </div>
                    <div>
                      <label className="label">Reason Shopped</label>
                      <select
                        value={formData.reasonsShopped || ''}
                        onChange={(e) => updateField('reasonsShopped', e.target.value)}
                        className="input"
                      >
                        <option value="">Select reason...</option>
                        {reasonOptions.map((reason) => (
                          <option key={reason} value={reason}>{reason}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Status</label>
                      <select
                        value={formData.status || 'available'}
                        onChange={(e) => updateField('status', e.target.value as Car['status'])}
                        className="input"
                      >
                        <option value="available">Available</option>
                        <option value="planned">Planned</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="in_service">In Service</option>
                        <option value="in_shop">In Shop</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Portfolio</label>
                      <input
                        type="text"
                        value={formData.portfolio || ''}
                        onChange={(e) => updateField('portfolio', e.target.value)}
                        className="input"
                        placeholder="Lease status"
                      />
                    </div>
                  </div>

                  {/* Tank Car Specific Fields */}
                  {isTankCar && (
                    <div className="pt-4 border-t border-steel-200">
                      <h4 className="text-sm font-medium text-steel-700 mb-3">Tank Car Details</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="lined"
                            checked={formData.lined || false}
                            onChange={(e) => updateField('lined', e.target.checked)}
                            className="h-4 w-4 text-rail-600 rounded"
                          />
                          <label htmlFor="lined" className="text-sm text-steel-700">Lined</label>
                        </div>
                        <div>
                          <label className="label">Lining Type</label>
                          <select
                            value={formData.liningType || ''}
                            onChange={(e) => updateField('liningType', e.target.value)}
                            className="input"
                          >
                            <option value="">Select...</option>
                            {liningTypeOptions.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="performTankQual"
                            checked={formData.performTankQual || false}
                            onChange={(e) => updateField('performTankQual', e.target.checked)}
                            className="h-4 w-4 text-rail-600 rounded"
                          />
                          <label htmlFor="performTankQual" className="text-sm text-steel-700">
                            Perform Tank Qual
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <label className="label">Full/Partial Qual</label>
                          <select
                            value={formData.fullPartialQual || ''}
                            onChange={(e) => updateField('fullPartialQual', e.target.value)}
                            className="input"
                          >
                            <option value="">Select...</option>
                            <option value="Full">Full</option>
                            <option value="Partial">Partial</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label">Notes</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => updateField('notes', e.target.value)}
                      className="input"
                      rows={3}
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-steel-600 mb-4">
                    Enter qualification due dates. Dates in prior years will be flagged as URGENT.
                    Dates in the current year will be flagged as MUST SHOP.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Min (no lining)</label>
                      <input
                        type="date"
                        value={formData.minNoLining || ''}
                        onChange={(e) => updateField('minNoLining', e.target.value || null)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Min w lining</label>
                      <input
                        type="date"
                        value={formData.minWLining || ''}
                        onChange={(e) => updateField('minWLining', e.target.value || null)}
                        className="input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Interior Lining</label>
                      <input
                        type="date"
                        value={formData.interiorLining || ''}
                        onChange={(e) => updateField('interiorLining', e.target.value || null)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Rule 88B</label>
                      <input
                        type="date"
                        value={formData.rule88B || ''}
                        onChange={(e) => updateField('rule88B', e.target.value || null)}
                        className="input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Safety Relief</label>
                      <input
                        type="date"
                        value={formData.safetyRelief || ''}
                        onChange={(e) => updateField('safetyRelief', e.target.value || null)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Service Equipment</label>
                      <input
                        type="date"
                        value={formData.serviceEquipment || ''}
                        onChange={(e) => updateField('serviceEquipment', e.target.value || null)}
                        className="input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Stub Sill</label>
                      <input
                        type="date"
                        value={formData.stubSill || ''}
                        onChange={(e) => updateField('stubSill', e.target.value || null)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Tank Thickness</label>
                      <input
                        type="date"
                        value={formData.tankThickness || ''}
                        onChange={(e) => updateField('tankThickness', e.target.value || null)}
                        className="input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Tank Qualification</label>
                      <input
                        type="date"
                        value={formData.tankQualification || ''}
                        onChange={(e) => updateField('tankQualification', e.target.value || null)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Scheduled</label>
                      <input
                        type="date"
                        value={formData.scheduled || ''}
                        onChange={(e) => updateField('scheduled', e.target.value || null)}
                        className="input"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-steel-200 bg-steel-50">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Saving...' : editingCar ? 'Save Changes' : 'Create Railcar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
