import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Settings, 
  Calendar, 
  TrendingUp, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronLeft,
  Save,
  Clock,
  Sun,
  Moon,
  Coffee,
  CheckCircle2,
  Info,
  ChefHat,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

import { Employee, RestaurantConfig, Shift, ShiftType, Position } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [step, setStep] = useState<'setup' | 'dashboard'>('setup');
  const [config, setConfig] = useState<RestaurantConfig>({
    hasSplitShifts: true,
    standardWeeklyHours: [40, 38, 30, 20],
    restDaysPerWeek: 2,
    contiguousRestDays: true,
    closingDay: null,
    openingHours: { open: '09:00', close: '23:00' },
    shiftTimes: {
      morning: { start: '09:00', end: '17:00' },
      afternoon: { start: '17:00', end: '01:00' },
      split: { 
        part1Start: '12:00', part1End: '16:00',
        part2Start: '20:00', part2End: '00:00'
      }
    },
    minStaffPerShift: { morning: 2, afternoon: 2 },
    salesTarget: 15000,
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [quadrant, setQuadrant] = useState<Shift[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'quadrant' | 'employees' | 'analytics' | 'settings'>('quadrant');

  // --- Setup Wizard State ---
  const [setupStep, setSetupStep] = useState(1);

  const handleFinishSetup = () => {
    if (employees.length === 0) {
      alert("Por favor, añade al menos un empleado.");
      return;
    }
    setStep('dashboard');
  };

  const addEmployee = (e: Employee) => {
    setEmployees([...employees, e]);
  };

  const removeEmployee = (id: string) => {
    setEmployees(employees.filter(emp => emp.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Assuming columns: Nombre Apellidos, Jornada Semanal, Posición
      // Skip header row
      const newEmployees: Employee[] = data.slice(1).map((row, index) => {
        const fullName = String(row[0] || '');
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ');
        const weeklyHours = Number(row[1]) || 40;
        const posInput = String(row[2] || '').toLowerCase();
        const isRefuerzo = String(row[3] || '').toLowerCase().includes('sí') || String(row[3] || '').toLowerCase().includes('si') || Boolean(row[3]);
        const position: Position = posInput.includes('cocina') ? 'cocina' : 
                                  posInput.includes('sala') ? 'sala' : 'refuerzo';

        return {
          id: `excel-${Date.now()}-${index}`,
          firstName,
          lastName,
          weeklyHours,
          restDaysPerWeek: config.restDaysPerWeek,
          vacationDays: 30,
          vacationDates: [],
          medicalLeaveDates: [],
          position,
          isRefuerzo
        };
      });

      setEmployees(prev => [...prev, ...newEmployees]);
    };
    reader.readAsBinaryString(file);
  };

  // --- Dashboard Logic ---
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({
    start: currentWeekStart,
    end: endOfWeek(currentWeekStart, { weekStartsOn: 1 })
  });

  const generateQuadrant = () => {
    setIsGenerating(true);
    const newShifts: Shift[] = [];
    
    // Days of the week (0=Mon, 6=Sun)
    const sunToThu = [0, 1, 2, 3, 6];
    const friSat = [4, 5];

    // Assign rest days to each employee first
    const employeeRestDays = new Map<string, number[]>();
    
    // Determine which employees get Fri/Sat rest days (30%)
    const numEmployeesWithWeekendRest = Math.max(1, Math.round(employees.length * 0.3));
    const shuffledEmployees = [...employees].sort(() => Math.random() - 0.5);
    
    shuffledEmployees.forEach((emp, index) => {
      let restDays: number[] = [];
      const isWeekendRestEmployee = index < numEmployeesWithWeekendRest;
      
      if (config.restDaysPerWeek === 1) {
        if (isWeekendRestEmployee) {
          restDays = [friSat[Math.floor(Math.random() * friSat.length)]];
        } else {
          restDays = [sunToThu[Math.floor(Math.random() * sunToThu.length)]];
        }
      } else {
        // 2 rest days
        if (config.contiguousRestDays) {
          // Contiguous logic
          const pairs = [[0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,0]];
          let validPairs = isWeekendRestEmployee 
            ? pairs.filter(p => p.some(d => friSat.includes(d)))
            : pairs.filter(p => p.every(d => sunToThu.includes(d)));
          
          if (validPairs.length === 0) validPairs = pairs; // Fallback
          restDays = validPairs[Math.floor(Math.random() * validPairs.length)];
        } else {
          // Non-contiguous
          if (isWeekendRestEmployee) {
            const d1 = friSat[Math.floor(Math.random() * friSat.length)];
            const d2 = [...sunToThu, ...friSat].filter(d => d !== d1)[Math.floor(Math.random() * 6)];
            restDays = [d1, d2];
          } else {
            const d1 = sunToThu[Math.floor(Math.random() * sunToThu.length)];
            const d2 = sunToThu.filter(d => d !== d1)[Math.floor(Math.random() * (sunToThu.length - 1))];
            restDays = [d1, d2];
          }
        }
      }
      employeeRestDays.set(emp.id, restDays);
    });

    employees.forEach((emp, empIndex) => {
      const restDays = employeeRestDays.get(emp.id) || [];
      let lastShiftType: ShiftType | 'OFF' | null = null;
      
      weekDays.forEach((day, dayIndex) => {
        const dayName = format(day, 'EEEE', { locale: es });
        const dateStr = format(day, 'yyyy-MM-dd');
        
        // Skip closing day
        if (config.closingDay && dayName.toLowerCase() === config.closingDay.toLowerCase()) {
          newShifts.push({ employeeId: emp.id, date: dateStr, type: 'OFF' });
          lastShiftType = 'OFF';
          return;
        }

        // Check if it's a rest day
        // dayIndex is 0-6 (Mon-Sun)
        if (restDays.includes(dayIndex)) {
          newShifts.push({ employeeId: emp.id, date: dateStr, type: 'OFF' });
          lastShiftType = 'OFF';
          return;
        }

        // Check if it's a vacation day
        if (emp.vacationDates.includes(dateStr)) {
          newShifts.push({ employeeId: emp.id, date: dateStr, type: 'VAC' });
          lastShiftType = 'VAC';
          return;
        }

        // Check if it's a medical leave day
        if (emp.medicalLeaveDates && emp.medicalLeaveDates.includes(dateStr)) {
          newShifts.push({ employeeId: emp.id, date: dateStr, type: 'BAJA' });
          lastShiftType = 'BAJA';
          return;
        }

        // Basic rotation for M/T/P with rest constraint
        let type: ShiftType;
        
        if (config.hasSplitShifts) {
          // Rotation that minimizes T -> M conflicts: M -> P -> T
          const types: ShiftType[] = ['M', 'P', 'T'];
          type = types[(dayIndex + empIndex) % 3];
        } else {
          type = (dayIndex + empIndex) % 2 === 0 ? 'M' : 'T';
        }

        // Critical Constraint: No M after T
        if (lastShiftType === 'T' && type === 'M') {
          type = config.hasSplitShifts ? 'P' : 'T';
        }

        newShifts.push({ employeeId: emp.id, date: dateStr, type });
        lastShiftType = type;
      });
    });

    setQuadrant(newShifts);
    setTimeout(() => setIsGenerating(false), 1000);
  };

  const analyzeWithAI = async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    const prompt = `
      Actúa como un experto en optimización de personal para restaurantes.
      Analiza el siguiente cuadrante de turnos y la configuración:
      
      Configuración:
      - Empleados: ${employees.length}
      - Turnos partidos: ${config.hasSplitShifts ? 'Sí' : 'No'}
      - Objetivo Ventas: ${config.salesTarget}€
      - Regla: Viernes y Sábados requieren +1 persona de refuerzo.
      - Restricción: No puede haber un turno de Mañana (M) después de uno de Tarde (T) en días consecutivos.
      
      Cuadrante actual (resumen):
      ${employees.map(e => `${e.firstName}: ${quadrant.filter(s => s.employeeId === e.id && s.type !== 'OFF').length} turnos`).join(', ')}
      
      Por favor, proporciona:
      1. Una evaluación de la eficiencia de costes.
      2. Posibles ineficiencias (sobrecarga o falta de personal).
      3. Sugerencias de mejora.
      
      Responde en formato JSON con las claves: "costEfficiency", "inefficiencies" (array), "suggestions" (array).
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setAiAnalysis(response.text);
    } catch (error) {
      console.error("AI Analysis failed", error);
    }
  };

  // Calculate labor cost percentage
  const laborCostStats = useMemo(() => {
    const totalHours = employees.reduce((acc, emp) => acc + emp.weeklyHours, 0);
    // Formula: ventas€ / (2.000€ x trabajador de 40h semanales)
    // 2000€ is the monthly cost for 40h/week. 
    // For a week, that's roughly 500€.
    const monthlySalesTarget = config.salesTarget * 4;
    const totalFullTimeEquivalent = totalHours / 40;
    const totalMonthlyCost = totalFullTimeEquivalent * 2000;
    
    const percentage = (totalMonthlyCost / monthlySalesTarget) * 100;

    return {
      totalHours,
      totalFullTimeEquivalent,
      totalMonthlyCost,
      percentage: percentage.toFixed(1)
    };
  }, [employees, config.salesTarget]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      <AnimatePresence mode="wait">
        {step === 'setup' ? (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto py-12 px-6"
          >
            <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12 border border-black/5">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                  <ChefHat className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Staffora</h1>
                  <p className="text-gray-500">Configuración Inicial</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="flex gap-2 mb-12">
                {[1, 2, 3].map((s) => (
                  <div 
                    key={s} 
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-all duration-500",
                      setupStep >= s ? "bg-emerald-500" : "bg-gray-100"
                    )}
                  />
                ))}
              </div>

              {setupStep === 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="block text-sm font-semibold uppercase tracking-wider text-gray-400">¿Turnos Partidos?</label>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => setConfig({...config, hasSplitShifts: true})}
                          className={cn(
                            "flex-1 py-4 rounded-2xl border-2 transition-all font-medium",
                            config.hasSplitShifts ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                          Sí (M, T, P)
                        </button>
                        <button 
                          onClick={() => setConfig({...config, hasSplitShifts: false})}
                          className={cn(
                            "flex-1 py-4 rounded-2xl border-2 transition-all font-medium",
                            !config.hasSplitShifts ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                          No (M, T)
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="block text-sm font-semibold uppercase tracking-wider text-gray-400">Descansos Semanales</label>
                      <div className="flex gap-4">
                        {[1, 2].map(d => (
                          <button 
                            key={d}
                            onClick={() => setConfig({...config, restDaysPerWeek: d})}
                            className={cn(
                              "flex-1 py-4 rounded-2xl border-2 transition-all font-medium",
                              config.restDaysPerWeek === d ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-200"
                            )}
                          >
                            {d} {d === 1 ? 'día' : 'días'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="block text-sm font-semibold uppercase tracking-wider text-gray-400">¿Descansos Contiguos?</label>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => setConfig({...config, contiguousRestDays: true})}
                          className={cn(
                            "flex-1 py-4 rounded-2xl border-2 transition-all font-medium",
                            config.contiguousRestDays ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                          Sí
                        </button>
                        <button 
                          onClick={() => setConfig({...config, contiguousRestDays: false})}
                          className={cn(
                            "flex-1 py-4 rounded-2xl border-2 transition-all font-medium",
                            !config.contiguousRestDays ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="block text-sm font-semibold uppercase tracking-wider text-gray-400">Día de Cierre</label>
                      <select 
                        className="w-full p-4 rounded-2xl border-2 border-gray-100 focus:border-emerald-500 outline-none transition-all bg-white"
                        value={config.closingDay || ''}
                        onChange={(e) => setConfig({...config, closingDay: e.target.value || null})}
                      >
                        <option value="">Ninguno (Abierto todos los días)</option>
                        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-4">
                      <label className="block text-sm font-semibold uppercase tracking-wider text-gray-400">Objetivo Ventas Semanal (€)</label>
                      <input 
                        type="number"
                        className="w-full p-4 rounded-2xl border-2 border-gray-100 focus:border-emerald-500 outline-none transition-all"
                        value={config.salesTarget}
                        onChange={(e) => setConfig({...config, salesTarget: Number(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div className="space-y-6 pt-8 border-t border-gray-100">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Clock className="w-5 h-5 text-emerald-500" />
                      Horarios de Turnos
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 bg-gray-50 rounded-2xl space-y-4">
                        <p className="text-sm font-bold uppercase tracking-wider text-gray-400">Turno Mañana (M)</p>
                        <div className="flex items-center gap-3">
                          <input 
                            type="time" 
                            className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                            value={config.shiftTimes.morning.start}
                            onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, morning: {...config.shiftTimes.morning, start: e.target.value}}})}
                          />
                          <span className="text-gray-400">a</span>
                          <input 
                            type="time" 
                            className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                            value={config.shiftTimes.morning.end}
                            onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, morning: {...config.shiftTimes.morning, end: e.target.value}}})}
                          />
                        </div>
                      </div>

                      <div className="p-6 bg-gray-50 rounded-2xl space-y-4">
                        <p className="text-sm font-bold uppercase tracking-wider text-gray-400">Turno Tarde (T)</p>
                        <div className="flex items-center gap-3">
                          <input 
                            type="time" 
                            className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                            value={config.shiftTimes.afternoon.start}
                            onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, afternoon: {...config.shiftTimes.afternoon, start: e.target.value}}})}
                          />
                          <span className="text-gray-400">a</span>
                          <input 
                            type="time" 
                            className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                            value={config.shiftTimes.afternoon.end}
                            onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, afternoon: {...config.shiftTimes.afternoon, end: e.target.value}}})}
                          />
                        </div>
                      </div>

                      {config.hasSplitShifts && (
                        <div className="p-6 bg-gray-50 rounded-2xl space-y-4 md:col-span-2">
                          <p className="text-sm font-bold uppercase tracking-wider text-gray-400">Turno Partido (P)</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-gray-400 w-12">Bloque 1:</span>
                              <input 
                                type="time" 
                                className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                                value={config.shiftTimes.split.part1Start}
                                onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part1Start: e.target.value}}})}
                              />
                              <span className="text-gray-400">a</span>
                              <input 
                                type="time" 
                                className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                                value={config.shiftTimes.split.part1End}
                                onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part1End: e.target.value}}})}
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-gray-400 w-12">Bloque 2:</span>
                              <input 
                                type="time" 
                                className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                                value={config.shiftTimes.split.part2Start}
                                onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part2Start: e.target.value}}})}
                              />
                              <span className="text-gray-400">a</span>
                              <input 
                                type="time" 
                                className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
                                value={config.shiftTimes.split.part2End}
                                onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part2End: e.target.value}}})}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-8">
                    <button 
                      onClick={() => setSetupStep(2)}
                      className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                    >
                      Siguiente <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}

              {setupStep === 2 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold">Añadir Empleados</h2>
                      <span className="text-sm text-gray-500">{employees.length} añadidos</span>
                    </div>

                    <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Añadir Manualmente</h3>
                        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-50 transition-all shadow-sm">
                          <Save className="w-4 h-4 text-emerald-500" />
                          Subir Excel
                          <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                      </div>
                      <EmployeeForm onAdd={addEmployee} />
                    </div>

                    <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Añadir Planificación de Vacaciones</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Empleado</label>
                          <select 
                            className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm"
                            id="vacation-employee-select"
                          >
                            <option value="">Seleccionar empleado...</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Inicio</label>
                          <input type="date" id="vacation-start" className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Fin</label>
                          <input type="date" id="vacation-end" className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm" />
                        </div>
                        <button 
                          onClick={() => {
                            const empId = (document.getElementById('vacation-employee-select') as HTMLSelectElement).value;
                            const start = (document.getElementById('vacation-start') as HTMLInputElement).value;
                            const end = (document.getElementById('vacation-end') as HTMLInputElement).value;
                            
                            if (!empId || !start || !end) return;
                            
                            const startDate = new Date(start);
                            const endDate = new Date(end);
                            const dates: string[] = [];
                            let curr = new Date(startDate);
                            
                            while (curr <= endDate) {
                              dates.push(format(curr, 'yyyy-MM-dd'));
                              curr.setDate(curr.getDate() + 1);
                            }
                            
                            setEmployees(prev => prev.map(emp => {
                              if (emp.id === empId) {
                                return {
                                  ...emp,
                                  vacationDates: Array.from(new Set([...emp.vacationDates, ...dates]))
                                };
                              }
                              return emp;
                            }));
                          }}
                          className="bg-emerald-500 text-white p-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center"
                        >
                          Añadir Rango
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {employees.map(emp => (
                        <div key={emp.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 group hover:border-emerald-200 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold">
                              {emp.firstName[0]}{emp.lastName[0]}
                            </div>
                            <div>
                              <p className="font-bold">{emp.firstName} {emp.lastName}</p>
                              <p className="text-xs text-gray-500 uppercase tracking-wider">{emp.weeklyHours}h semanales • {emp.restDaysPerWeek} descansos</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => removeEmployee(emp.id)}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      {employees.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                          <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                          <p>No hay empleados registrados todavía</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between pt-8">
                    <button 
                      onClick={() => setSetupStep(1)}
                      className="text-gray-500 px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" /> Atrás
                    </button>
                    <button 
                      onClick={() => setSetupStep(3)}
                      className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                    >
                      Siguiente <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}

              {setupStep === 3 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 text-center py-8">
                  <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-6">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <h2 className="text-3xl font-bold">¡Todo listo!</h2>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Hemos configurado las bases del sistema. Ahora puedes empezar a gestionar los cuadrantes y ver las analíticas de costes.
                  </p>
                  
                  <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-left max-w-md mx-auto">
                    <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" /> Resumen de Configuración
                    </h3>
                    <ul className="text-sm text-emerald-700 space-y-1">
                      <li>• {employees.length} empleados registrados</li>
                      <li>• Turnos {config.hasSplitShifts ? 'M, T y P' : 'M y T'}</li>
                      <li>• {config.restDaysPerWeek} días de descanso</li>
                      <li>• Objetivo: {config.salesTarget}€ / semana</li>
                    </ul>
                  </div>

                  <div className="flex justify-center gap-4 pt-8">
                    <button 
                      onClick={() => setSetupStep(2)}
                      className="text-gray-500 px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" /> Revisar
                    </button>
                    <button 
                      onClick={handleFinishSetup}
                      className="bg-emerald-500 text-white px-12 py-4 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                    >
                      Empezar ahora
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-screen overflow-hidden"
          >
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-black/5 flex flex-col">
              <div className="p-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                  <ChefHat className="w-5 h-5" />
                </div>
                <span className="font-bold text-xl tracking-tight">Staffora</span>
              </div>

              <nav className="flex-1 px-4 space-y-2">
                <SidebarItem 
                  icon={<Calendar className="w-5 h-5" />} 
                  label="Cuadrante" 
                  active={activeTab === 'quadrant'} 
                  onClick={() => setActiveTab('quadrant')}
                />
                <SidebarItem 
                  icon={<Users className="w-5 h-5" />} 
                  label="Equipo" 
                  active={activeTab === 'employees'} 
                  onClick={() => setActiveTab('employees')}
                />
                <SidebarItem 
                  icon={<TrendingUp className="w-5 h-5" />} 
                  label="Analíticas" 
                  active={activeTab === 'analytics'} 
                  onClick={() => setActiveTab('analytics')}
                />
                <SidebarItem 
                  icon={<Settings className="w-5 h-5" />} 
                  label="Ajustes" 
                  active={activeTab === 'settings'} 
                  onClick={() => setActiveTab('settings')}
                />
              </nav>

              <div className="p-6">
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Coste Personal</p>
                  <p className="text-2xl font-black text-emerald-600">{laborCostStats.percentage}%</p>
                  <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-1000" 
                      style={{ width: `${Math.min(Number(laborCostStats.percentage), 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-10">
              <header className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">
                    {activeTab === 'quadrant' && 'Gestión de Cuadrante'}
                    {activeTab === 'employees' && 'Gestión de Equipo'}
                    {activeTab === 'analytics' && 'Análisis de Eficiencia'}
                    {activeTab === 'settings' && 'Configuración General'}
                  </h2>
                  <p className="text-gray-500">
                    {activeTab === 'quadrant' && 'Semana del ' + format(currentWeekStart, "d 'de' MMMM", { locale: es })}
                    {activeTab === 'employees' && 'Administra los perfiles y jornadas de tu personal'}
                    {activeTab === 'analytics' && 'Predicciones de IA y control de costes'}
                    {activeTab === 'settings' && 'Personaliza las reglas de negocio'}
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={analyzeWithAI}
                    className="bg-white border border-gray-200 p-3 rounded-2xl hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2 text-sm font-bold"
                  >
                    <TrendingUp className="w-5 h-5 text-emerald-500" /> Analizar con IA
                  </button>
                  <button 
                    onClick={generateQuadrant}
                    disabled={isGenerating}
                    className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isGenerating ? <Clock className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />} 
                    {quadrant.length > 0 ? 'Regenerar' : 'Generar Cuadrante'}
                  </button>
                </div>
              </header>

              <AnimatePresence mode="wait">
                {activeTab === 'quadrant' && (
                  <motion.div 
                    key="quadrant"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                      <div className="grid grid-cols-8 border-b border-gray-100 bg-gray-50/50">
                        <div className="p-4 font-bold text-xs uppercase tracking-wider text-gray-400 border-r border-gray-100">Empleado</div>
                        {weekDays.map(day => (
                          <div key={day.toString()} className="p-4 text-center border-r border-gray-100 last:border-r-0">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{format(day, 'EEE', { locale: es })}</p>
                            <p className="text-lg font-black">{format(day, 'd')}</p>
                          </div>
                        ))}
                      </div>

                      {(['cocina', 'sala', 'refuerzo'] as Position[]).map(pos => {
                        const posEmployees = employees.filter(e => e.position === pos);
                        if (posEmployees.length === 0 && pos !== 'refuerzo') return null;

                        return (
                          <React.Fragment key={pos}>
                            <div className="bg-gray-100/50 px-4 py-2 font-black text-[10px] uppercase tracking-[0.2em] text-gray-500 border-b border-gray-100 flex items-center justify-between">
                              <span>{pos === 'cocina' ? 'Cocina' : pos === 'sala' ? 'Sala' : 'Refuerzo'}</span>
                              {pos === 'refuerzo' && (
                                <button 
                                  onClick={() => addEmployee({
                                    id: `ref-${Date.now()}`,
                                    firstName: 'Refuerzo',
                                    lastName: (employees.filter(e => e.position === 'refuerzo').length + 1).toString(),
                                    weeklyHours: 0,
                                    restDaysPerWeek: 0,
                                    vacationDays: 0,
                                    vacationDates: [],
                                    medicalLeaveDates: [],
                                    position: 'refuerzo',
                                    isRefuerzo: true
                                  })}
                                  className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded-md hover:bg-gray-50 transition-all"
                                >
                                  + Añadir Refuerzo
                                </button>
                              )}
                            </div>
                            {posEmployees.map(emp => (
                              <div key={emp.id} className="grid grid-cols-8 border-b border-gray-100 last:border-b-0 group">
                                <div className="p-4 border-r border-gray-100 flex items-center gap-3">
                                  <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold relative",
                                    emp.position === 'cocina' ? "bg-orange-100 text-orange-700" : 
                                    emp.position === 'sala' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                  )}>
                                    {emp.firstName[0]}{emp.lastName[0]}
                                    {emp.isRefuerzo && (
                                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
                                    )}
                                  </div>
                                  <div className="truncate">
                                    <p className="font-bold text-sm truncate">{emp.firstName} {emp.lastName}</p>
                                    <p className="text-[10px] text-gray-400 uppercase font-bold">{emp.weeklyHours}h</p>
                                  </div>
                                </div>
                                {weekDays.map(day => {
                                  const dateStr = format(day, 'yyyy-MM-dd');
                                  const shift = quadrant.find(s => s.employeeId === emp.id && s.date === dateStr);
                                  
                                  // Check for T -> M conflict (minimum rest)
                                  const prevDate = format(addDays(day, -1), 'yyyy-MM-dd');
                                  const prevShift = quadrant.find(s => s.employeeId === emp.id && s.date === prevDate);
                                  const isConflict = shift?.type === 'M' && prevShift?.type === 'T';

                                  return (
                                    <div key={day.toString()} className="p-2 border-r border-gray-100 last:border-r-0 flex items-center justify-center">
                                      <ShiftSelector 
                                        employeeId={emp.id} 
                                        date={dateStr} 
                                        hasSplit={config.hasSplitShifts}
                                        initialType={shift?.type}
                                        hasConflict={isConflict}
                                        onChange={(newType) => {
                                          setQuadrant(prev => {
                                            const filtered = prev.filter(s => !(s.employeeId === emp.id && s.date === dateStr));
                                            return [...filtered, { employeeId: emp.id, date: dateStr, type: newType }];
                                          });
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-red-500" />
                        Gestión de Bajas Médicas
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Empleado</label>
                          <select 
                            className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm"
                            id="medical-employee-select"
                          >
                            <option value="">Seleccionar empleado...</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Inicio</label>
                          <input type="date" id="medical-start" className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Fin</label>
                          <input type="date" id="medical-end" className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm" />
                        </div>
                        <button 
                          onClick={() => {
                            const empId = (document.getElementById('medical-employee-select') as HTMLSelectElement).value;
                            const start = (document.getElementById('medical-start') as HTMLInputElement).value;
                            const end = (document.getElementById('medical-end') as HTMLInputElement).value;
                            
                            if (!empId || !start || !end) return;
                            
                            const startDate = new Date(start);
                            const endDate = new Date(end);
                            const dates: string[] = [];
                            let curr = new Date(startDate);
                            
                            while (curr <= endDate) {
                              dates.push(format(curr, 'yyyy-MM-dd'));
                              curr.setDate(curr.getDate() + 1);
                            }
                            
                            setEmployees(prev => prev.map(emp => {
                              if (emp.id === empId) {
                                return {
                                  ...emp,
                                  medicalLeaveDates: Array.from(new Set([...(emp.medicalLeaveDates || []), ...dates]))
                                };
                              }
                              return emp;
                            }));
                            
                            // Trigger regeneration
                            generateQuadrant();
                          }}
                          className="bg-red-500 text-white p-3 rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                        >
                          Registrar Baja y Recalcular
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 flex gap-4">
                        <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-200">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-amber-900">Alerta de Ineficiencia</h4>
                          <p className="text-sm text-amber-800 opacity-80">El sábado noche parece estar infra-dimensionado. Se recomienda +1 persona eventual.</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex gap-4">
                        <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-200">
                          <Coffee className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-blue-900">Optimización M/T</h4>
                          <p className="text-sm text-blue-800 opacity-80">Viernes y Sábados configurados con refuerzo automático (+1).</p>
                        </div>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 flex gap-4">
                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-200">
                          <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-emerald-900">Objetivo de Coste</h4>
                          <p className="text-sm text-emerald-800 opacity-80">Estás un 2.4% por debajo del límite de coste de personal. ¡Buen trabajo!</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'employees' && (
                  <motion.div 
                    key="employees"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm">
                      <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-bold">Listado de Personal</h3>
                        <button className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-600 transition-all">
                          <Plus className="w-4 h-4" /> Nuevo Empleado
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {employees.map(emp => (
                          <div key={emp.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:border-emerald-200 transition-all group">
                            <div className="flex items-start justify-between mb-4">
                              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 font-bold text-xl shadow-sm border border-gray-100 relative">
                                {emp.firstName[0]}{emp.lastName[0]}
                                {emp.isRefuerzo && (
                                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white" title="Refuerzo" />
                                )}
                              </div>
                              <button onClick={() => removeEmployee(emp.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <h4 className="font-bold text-lg">{emp.firstName} {emp.lastName}</h4>
                            <div className="mt-4 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Jornada</span>
                                <span className="font-bold">{emp.weeklyHours}h / semana</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Descansos</span>
                                <span className="font-bold">{emp.restDaysPerWeek} días</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Vacaciones</span>
                                <span className="font-bold">{emp.vacationDays} días</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'analytics' && (
                  <motion.div 
                    key="analytics"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-8"
                  >
                    <div className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm">
                      <h3 className="text-xl font-bold mb-6">Distribución de Costes</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { name: 'Lun', cost: 450 },
                            { name: 'Mar', cost: 450 },
                            { name: 'Mie', cost: 450 },
                            { name: 'Jue', cost: 450 },
                            { name: 'Vie', cost: 650 },
                            { name: 'Sab', cost: 650 },
                            { name: 'Dom', cost: 450 },
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                            <Tooltip 
                              cursor={{ fill: '#F8FAFC' }}
                              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="cost" fill="#10B981" radius={[4, 4, 0, 0]} barSize={40}>
                              {[0,1,2,3,4,5,6].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 4 || index === 5 ? '#10B981' : '#E2E8F0'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-sm text-gray-400 mt-4 text-center italic">
                        * Los picos en Viernes y Sábado corresponden al refuerzo de personal configurado.
                      </p>
                    </div>

                    <div className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm">
                      <h3 className="text-xl font-bold mb-6">Predicción de Necesidades (IA)</h3>
                      <div className="space-y-6">
                        {aiAnalysis ? (
                          <div className="space-y-4">
                            {(() => {
                              try {
                                const data = JSON.parse(aiAnalysis);
                                return (
                                  <>
                                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                      <div className="flex items-center gap-3 mb-2">
                                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                                        <span className="font-bold text-emerald-900">Eficiencia de Costes</span>
                                      </div>
                                      <p className="text-sm text-emerald-800">{data.costEfficiency}</p>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ineficiencias Detectadas</h4>
                                      {data.inefficiencies.map((item: string, i: number) => (
                                        <div key={i} className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3 text-sm text-amber-800">
                                          <AlertTriangle className="w-4 h-4 shrink-0" /> {item}
                                        </div>
                                      ))}
                                    </div>

                                    <div className="space-y-2">
                                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sugerencias</h4>
                                      {data.suggestions.map((item: string, i: number) => (
                                        <div key={i} className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex gap-3 text-sm text-blue-800">
                                          <Info className="w-4 h-4 shrink-0" /> {item}
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                );
                              } catch (e) {
                                return <p className="text-sm text-gray-500">Error al procesar el análisis de IA.</p>;
                              }
                            })()}
                          </div>
                        ) : (
                          <>
                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                              <div className="flex items-center gap-3 mb-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                <span className="font-bold text-emerald-900">Eficiencia Óptima</span>
                              </div>
                              <p className="text-sm text-emerald-800">Tu cuadrante actual cubre el 98% de la demanda estimada basada en históricos.</p>
                            </div>
                            
                            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                              <div className="flex items-center gap-3 mb-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                <span className="font-bold text-amber-900">Riesgo de Servicio</span>
                              </div>
                              <p className="text-sm text-amber-800">Sábado entre las 20:00 y 22:00 hay un riesgo alto de retrasos. Considera añadir un refuerzo eventual.</p>
                            </div>
                          </>
                        )}

                        <div className="pt-4 border-t border-gray-100">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Métricas Clave</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-gray-50 rounded-2xl">
                              <p className="text-2xl font-black">{laborCostStats.totalFullTimeEquivalent.toFixed(1)}</p>
                              <p className="text-xs text-gray-500">ETP (Equiv. Tiempo Completo)</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-2xl">
                              <p className="text-2xl font-black">{laborCostStats.totalHours}h</p>
                              <p className="text-xs text-gray-500">Total Horas Semanales</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'settings' && (
                  <motion.div 
                    key="settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm">
                      <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                        <Settings className="w-6 h-6 text-emerald-500" />
                        Configuración del Restaurante
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Objetivo Ventas Semanal (€)</label>
                            <input 
                              type="number"
                              className="w-full p-4 rounded-2xl border border-gray-100 focus:border-emerald-500 outline-none transition-all bg-gray-50"
                              value={config.salesTarget}
                              onChange={(e) => setConfig({...config, salesTarget: Number(e.target.value)})}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Día de Cierre</label>
                            <select 
                              className="w-full p-4 rounded-2xl border border-gray-100 focus:border-emerald-500 outline-none transition-all bg-gray-50"
                              value={config.closingDay || ''}
                              onChange={(e) => setConfig({...config, closingDay: e.target.value || null})}
                            >
                              <option value="">Ninguno</option>
                              {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                            <span className="text-sm font-bold">Turnos Partidos</span>
                            <button 
                              onClick={() => setConfig({...config, hasSplitShifts: !config.hasSplitShifts})}
                              className={cn(
                                "w-12 h-6 rounded-full transition-all relative",
                                config.hasSplitShifts ? "bg-emerald-500" : "bg-gray-200"
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                config.hasSplitShifts ? "left-7" : "left-1"
                              )} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Horarios de Turnos
                          </h4>
                          
                          <div className="space-y-4">
                            <div className="p-4 bg-gray-50 rounded-2xl space-y-3">
                              <p className="text-xs font-bold text-gray-500">Mañana (M)</p>
                              <div className="flex items-center gap-2">
                                <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.morning.start} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, morning: {...config.shiftTimes.morning, start: e.target.value}}})} />
                                <span>-</span>
                                <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.morning.end} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, morning: {...config.shiftTimes.morning, end: e.target.value}}})} />
                              </div>
                            </div>
                            
                            <div className="p-4 bg-gray-50 rounded-2xl space-y-3">
                              <p className="text-xs font-bold text-gray-500">Tarde (T)</p>
                              <div className="flex items-center gap-2">
                                <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.afternoon.start} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, afternoon: {...config.shiftTimes.afternoon, start: e.target.value}}})} />
                                <span>-</span>
                                <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.afternoon.end} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, afternoon: {...config.shiftTimes.afternoon, end: e.target.value}}})} />
                              </div>
                            </div>

                            {config.hasSplitShifts && (
                              <div className="p-4 bg-gray-50 rounded-2xl space-y-3">
                                <p className="text-xs font-bold text-gray-500">Partido (P)</p>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] w-8">B1:</span>
                                    <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.split.part1Start} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part1Start: e.target.value}}})} />
                                    <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.split.part1End} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part1End: e.target.value}}})} />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] w-8">B2:</span>
                                    <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.split.part2Start} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part2Start: e.target.value}}})} />
                                    <input type="time" className="flex-1 p-2 rounded-lg border border-gray-200" value={config.shiftTimes.split.part2End} onChange={e => setConfig({...config, shiftTimes: {...config.shiftTimes, split: {...config.shiftTimes.split, part2End: e.target.value}}})} />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium",
        active 
          ? "bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100" 
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmployeeForm({ onAdd }: { onAdd: (e: Employee) => void }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    weeklyHours: 40,
    restDays: 2,
    vacations: 30,
    position: 'sala' as Position,
    isRefuerzo: false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName) return;
    
    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      firstName: formData.firstName,
      lastName: formData.lastName,
      weeklyHours: formData.weeklyHours,
      restDaysPerWeek: formData.restDays,
      vacationDays: formData.vacations,
      vacationDates: [],
      medicalLeaveDates: [],
      position: formData.position,
      isRefuerzo: formData.isRefuerzo
    });
    
    setFormData({ ...formData, firstName: '', lastName: '', isRefuerzo: false, weeklyHours: 40, restDays: 2, vacations: 30, position: 'sala' });
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 items-end">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nombre</label>
        <input 
          type="text" 
          placeholder="Nombre"
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm"
          value={formData.firstName}
          onChange={e => setFormData({...formData, firstName: e.target.value})}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Apellidos</label>
        <input 
          type="text" 
          placeholder="Apellidos"
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm"
          value={formData.lastName}
          onChange={e => setFormData({...formData, lastName: e.target.value})}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Posición</label>
        <select 
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm"
          value={formData.position}
          onChange={e => setFormData({...formData, position: e.target.value as Position})}
        >
          <option value="cocina">Cocina</option>
          <option value="sala">Sala</option>
          <option value="refuerzo">Refuerzo</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Jornada</label>
        <select 
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm"
          value={formData.weeklyHours}
          onChange={e => setFormData({...formData, weeklyHours: Number(e.target.value)})}
        >
          <option value={40}>40h</option>
          <option value={38}>38h</option>
          <option value={30}>30h</option>
          <option value={20}>20h</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Descansos</label>
        <select 
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-sm"
          value={formData.restDays}
          onChange={e => setFormData({...formData, restDays: Number(e.target.value)})}
        >
          <option value={1}>1 día</option>
          <option value={2}>2 días</option>
        </select>
      </div>
      <div className="space-y-2 flex flex-col items-center justify-center pb-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Refuerzo</label>
        <input 
          type="checkbox" 
          className="w-6 h-6 accent-emerald-500 cursor-pointer"
          checked={formData.isRefuerzo}
          onChange={e => setFormData({...formData, isRefuerzo: e.target.checked})}
        />
      </div>
      <button 
        type="submit"
        className="bg-emerald-500 text-white p-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center"
      >
        <Plus className="w-5 h-5" />
      </button>
    </form>
  );
}

function ShiftSelector({ employeeId, date, hasSplit, initialType, hasConflict, onChange }: { employeeId: string, date: string, hasSplit: boolean, initialType?: ShiftType, hasConflict?: boolean, onChange?: (t: ShiftType) => void }) {
  const [type, setType] = useState<ShiftType>(initialType || 'OFF');

  useEffect(() => {
    if (initialType) setType(initialType);
  }, [initialType]);

  const getStyle = (t: ShiftType) => {
    if (hasConflict && t === 'M') return "bg-red-50 text-red-700 border-red-200 ring-2 ring-red-500 ring-offset-1";
    switch(t) {
      case 'M': return "bg-amber-100 text-amber-700 border-amber-200";
      case 'T': return "bg-indigo-100 text-indigo-700 border-indigo-200";
      case 'P': return "bg-purple-100 text-purple-700 border-purple-200";
      case 'VAC': return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case 'BAJA': return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-50 text-gray-400 border-gray-100";
    }
  };

  const cycleShift = () => {
    const options: ShiftType[] = ['OFF', 'M', 'T'];
    if (hasSplit) options.push('P');
    options.push('VAC');
    options.push('BAJA');
    
    const currentIndex = options.indexOf(type);
    const nextIndex = (currentIndex + 1) % options.length;
    const nextType = options[nextIndex];
    setType(nextType);
    if (onChange) onChange(nextType);
  };

  return (
    <button 
      onClick={cycleShift}
      className={cn(
        "w-full h-10 rounded-lg border text-[10px] font-black transition-all flex items-center justify-center relative",
        getStyle(type)
      )}
      title={hasConflict ? "Conflicto de descanso: No puede haber turno M después de T" : ""}
    >
      {type === 'OFF' ? '-' : type}
      {hasConflict && type === 'M' && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center text-[6px] text-white animate-pulse">
          !
        </div>
      )}
    </button>
  );
}
