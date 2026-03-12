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
  Activity,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, getMonth, getYear } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

import { Employee, RestaurantConfig, Shift, ShiftType, Position, User, BusinessUnit, QuadrantState } from './types';

const USERS: User[] = [
  { id: '001', role: 'admin' },
  { id: '002', role: 'admin' },
  { id: '003', role: 'admin' },
  { id: '202', role: 'manager', assignedUnitId: '202' },
  { id: '204', role: 'manager', assignedUnitId: '204' },
  { id: '301', role: 'manager', assignedUnitId: '301' },
  { id: '401', role: 'manager', assignedUnitId: '401' },
  { id: '402', role: 'manager', assignedUnitId: '402' },
];

const BUSINESS_UNITS: BusinessUnit[] = [
  { id: '202', name: 'Unidad 202' },
  { id: '204', name: 'Unidad 204' },
  { id: '301', name: 'Unidad 301' },
  { id: '401', name: 'Unidad 401' },
  { id: '402', name: 'Unidad 402' },
];

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUnitId, setCurrentUnitId] = useState<string>('');
  const [loginId, setLoginId] = useState('');
  const [loginError, setLoginError] = useState('');

  const [step, setStep] = useState<'landing' | 'setup' | 'dashboard'>('landing');
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
    targetPersonnelCost: 38.5,
    vatRate: 10,
  });

  const [allEmployees, setAllEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('all_employees');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [allQuadrants, setAllQuadrants] = useState<QuadrantState[]>(() => {
    const saved = localStorage.getItem('all_quadrants');
    return saved ? JSON.parse(saved) : [];
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'quadrant' | 'employees' | 'analytics' | 'settings'>('quadrant');
  const [viewMode, setViewMode] = useState<'week' | 'fortnight' | 'month'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0); // For week/fortnight navigation within the month

  useEffect(() => {
    localStorage.setItem('all_employees', JSON.stringify(allEmployees));
  }, [allEmployees]);

  useEffect(() => {
    localStorage.setItem('all_quadrants', JSON.stringify(allQuadrants));
  }, [allQuadrants]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = USERS.find(u => u.id === loginId);
    if (user) {
      setCurrentUser(user);
      setCurrentUnitId(user.assignedUnitId || BUSINESS_UNITS[0].id);
      setStep('dashboard');
      setLoginError('');
    } else {
      setLoginError('Número de usuario no válido');
    }
  };

  const currentMonth = selectedMonth;

  const employees = useMemo(() => {
    return allEmployees.filter(emp => emp.businessUnitId === currentUnitId);
  }, [allEmployees, currentUnitId]);

  const currentQuadrantState = useMemo(() => {
    return allQuadrants.find(q => q.businessUnitId === currentUnitId && q.month === currentMonth) || {
      month: currentMonth,
      businessUnitId: currentUnitId,
      shifts: [],
      isPublished: false
    };
  }, [allQuadrants, currentUnitId, currentMonth]);

  const quadrant = currentQuadrantState.shifts;
  const isPublished = currentQuadrantState.isPublished;

  const setQuadrant = (newShifts: Shift[] | ((prev: Shift[]) => Shift[])) => {
    setAllQuadrants(prev => {
      const existing = prev.find(q => q.businessUnitId === currentUnitId && q.month === currentMonth);
      const updatedShifts = typeof newShifts === 'function' ? newShifts(existing?.shifts || []) : newShifts;
      
      if (existing) {
        return prev.map(q => q === existing ? { ...q, shifts: updatedShifts } : q);
      } else {
        return [...prev, { month: currentMonth, businessUnitId: currentUnitId, shifts: updatedShifts, isPublished: false }];
      }
    });
  };

  const publishQuadrant = () => {
    setAllQuadrants(prev => {
      return prev.map(q => {
        if (q.businessUnitId === currentUnitId && q.month === currentMonth) {
          return { ...q, isPublished: true };
        }
        return q;
      });
    });
  };

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
    const employeeWithUnit = { ...e, businessUnitId: currentUnitId };
    setAllEmployees([...allEmployees, employeeWithUnit]);
  };

  const removeEmployee = (id: string) => {
    setAllEmployees(allEmployees.filter(emp => emp.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentUser?.role !== 'admin') return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length <= 1) {
          console.warn("El archivo Excel parece estar vacío o solo contiene cabeceras.");
          return;
        }

        // Columnas esperadas: nombre, posición, jornada, coste
        const newEmployees: Employee[] = jsonData.slice(1)
          .filter(row => row.length >= 1 && row[0]) // Filtrar filas vacías
          .map((row, index) => {
            const fullName = String(row[0] || '').trim();
            const [firstName, ...lastNameParts] = fullName.split(' ');
            const lastName = lastNameParts.join(' ') || ' ';
            
            const posInput = String(row[1] || '').toLowerCase();
            const position: Position = posInput.includes('cocina') ? 'cocina' : 
                                      posInput.includes('sala') ? 'sala' : 'refuerzo';
            
            const weeklyHours = Number(row[2]) || 40;
            const monthlyCost = Number(row[3]) || 0;

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
              isRefuerzo: position === 'refuerzo',
              monthlyCost,
              businessUnitId: currentUnitId
            };
          });

        if (newEmployees.length > 0) {
          setAllEmployees(prev => [...prev, ...newEmployees]);
        }
        
        // Resetear el input para permitir subir el mismo archivo si se desea
        e.target.value = '';
      } catch (error) {
        console.error("Error al leer el archivo Excel:", error);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- Dashboard Logic ---
  useEffect(() => {
    setCurrentWeekIndex(0);
  }, [selectedMonth, viewMode]);

  const currentPeriodStart = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    return startOfWeek(monthStart, { weekStartsOn: 1 });
  }, [selectedMonth]);

  const periodDays = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start, end });
  }, [selectedMonth]);

  const displayedDays = useMemo(() => {
    if (viewMode === 'month') return periodDays;
    
    if (viewMode === 'week') {
      const start = addDays(currentPeriodStart, currentWeekIndex * 7);
      return eachDayOfInterval({ start, end: addDays(start, 6) });
    }
    
    if (viewMode === 'fortnight') {
      const start = addDays(currentPeriodStart, currentWeekIndex * 14);
      return eachDayOfInterval({ start, end: addDays(start, 13) });
    }
    
    return periodDays;
  }, [periodDays, viewMode, currentWeekIndex, currentPeriodStart]);

  const generateQuadrant = (employeesOverride?: Employee[]) => {
    if (isPublished) {
      alert("Este cuadrante ya ha sido publicado y no se puede regenerar automáticamente.");
      return;
    }
    const employeesToUse = employeesOverride || employees;
    if (employeesToUse.length === 0) return;

    setIsGenerating(true);
    const newShifts: Shift[] = [];
    
    // Days of the week (0=Mon, 6=Sun)
    const sunToThu = [0, 1, 2, 3, 6];
    const friSat = [4, 5];

    // Assign rest days to each employee first
    const employeeRestDays = new Map<string, number[]>();
    
    // Determine which employees get Fri/Sat rest days (30%)
    const numEmployeesWithWeekendRest = Math.max(1, Math.round(employeesToUse.length * 0.3));
    const shuffledEmployees = [...employeesToUse].sort(() => Math.random() - 0.5);
    
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

    const lastShiftMap = new Map<string, ShiftType | 'OFF' | 'VAC' | 'BAJA' | null>();
    const mCountMap = new Map<string, number>();
    const tCountMap = new Map<string, number>();

    periodDays.forEach((day, dayIndex) => {
      const dayName = format(day, 'EEEE', { locale: es });
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayOfWeek = (dayIndex % 7); // 0=Mon, 6=Sun

      const availableEmployees: Employee[] = [];
      
      employeesToUse.forEach(emp => {
        const restDays = employeeRestDays.get(emp.id) || [];
        let status: 'OFF' | 'VAC' | 'BAJA' | null = null;

        if (config.closingDay && dayName.toLowerCase() === config.closingDay.toLowerCase()) status = 'OFF';
        else if (restDays.includes(dayOfWeek)) status = 'OFF';
        else if (emp.vacationDates.includes(dateStr)) status = 'VAC';
        else if (emp.medicalLeaveDates && emp.medicalLeaveDates.includes(dateStr)) status = 'BAJA';

        if (status) {
          newShifts.push({ employeeId: emp.id, date: dateStr, type: status });
          lastShiftMap.set(emp.id, status);
        } else {
          availableEmployees.push(emp);
        }
      });

      const N = availableEmployees.length;
      if (N === 0) return;

      // Calculate targets for the day (45% M, 45% T, 10% P)
      let targetP = config.hasSplitShifts ? Math.max(1, Math.round(N * 0.1)) : 0;
      if (N < 5 && config.hasSplitShifts) targetP = 0; // Don't force P if too few people
      
      let remaining = N - targetP;
      let targetM = Math.floor(remaining / 2);
      let targetT = remaining - targetM;

      // Randomize available employees but prioritize those with fewer total shifts to keep it fair
      const sortedEmployees = [...availableEmployees].sort((a, b) => {
        const aTotal = (mCountMap.get(a.id) || 0) + (tCountMap.get(a.id) || 0);
        const bTotal = (mCountMap.get(b.id) || 0) + (tCountMap.get(b.id) || 0);
        return aTotal - bTotal || Math.random() - 0.5;
      });

      // Handle "No M after T" constraint
      const restrictedFromM = sortedEmployees.filter(emp => lastShiftMap.get(emp.id) === 'T');
      const freeToM = sortedEmployees.filter(emp => lastShiftMap.get(emp.id) !== 'T');

      const dayAssignments = new Map<string, ShiftType>();

      // Assign shifts to restricted employees first (they MUST be T or P)
      restrictedFromM.forEach(emp => {
        let type: ShiftType;
        if (targetT > 0 && targetP > 0) {
          type = Math.random() < 0.8 ? 'T' : 'P';
          if (type === 'T') targetT--; else targetP--;
        } else if (targetT > 0) {
          type = 'T';
          targetT--;
        } else if (targetP > 0) {
          type = 'P';
          targetP--;
        } else {
          type = 'M'; // Emergency fallback
          targetM--;
        }
        dayAssignments.set(emp.id, type);
      });

      // Assign remaining shifts to freeToM
      freeToM.forEach(emp => {
        const mVal = mCountMap.get(emp.id) || 0;
        const tVal = tCountMap.get(emp.id) || 0;

        let type: ShiftType;
        if (targetM > 0 && targetT > 0) {
          // Balance based on employee's history
          if (mVal < tVal) type = 'M';
          else if (tVal < mVal) type = 'T';
          else type = Math.random() < 0.5 ? 'M' : 'T';
        } else if (targetM > 0) {
          type = 'M';
        } else if (targetT > 0) {
          type = 'T';
        } else {
          type = 'P';
        }

        if (type === 'M') targetM--;
        else if (type === 'T') targetT--;
        else targetP--;

        dayAssignments.set(emp.id, type);
      });

      // Save assignments and update history
      dayAssignments.forEach((type, empId) => {
        newShifts.push({ employeeId: empId, date: dateStr, type });
        lastShiftMap.set(empId, type);
        if (type === 'M') mCountMap.set(empId, (mCountMap.get(empId) || 0) + 1);
        if (type === 'T') tCountMap.set(empId, (tCountMap.get(empId) || 0) + 1);
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
      - Objetivo Ventas Mensual (Bruto): ${config.salesTarget}€
      - Tipo de IVA: ${config.vatRate}%
      - Ventas Netas Estimadas: ${laborCostStats.netSales.toFixed(2)}€
      - Coste Personal Objetivo: ${config.targetPersonnelCost}%
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
    const totalMonthlyCost = employees.reduce((acc, emp) => acc + (emp.monthlyCost || 0), 0);
    
    // Sales target is monthly and gross (IVA included)
    const netSales = config.salesTarget / (1 + config.vatRate / 100);
    const percentage = netSales > 0 ? (totalMonthlyCost / netSales) * 100 : 0;

    return {
      totalHours,
      totalFullTimeEquivalent: totalHours / 40,
      totalMonthlyCost,
      netSales,
      percentage: percentage.toFixed(1)
    };
  }, [employees, config.salesTarget, config.vatRate]);

  const downloadPDF = () => {
    if (quadrant.length === 0) return;

    const doc = new jsPDF('l', 'mm', 'a4');
    const monthYear = format(currentPeriodStart, 'MM/yy');
    const title = `cuadrante_${monthYear}_${viewMode}`;

    // Use displayedDays for the PDF content
    const daysToPrint = displayedDays;
    
    // Split into weeks for better layout if needed, but for PDF we can try to fit the view
    const weeks: Date[][] = [];
    for (let i = 0; i < daysToPrint.length; i += 7) {
      weeks.push(daysToPrint.slice(i, i + 7));
    }

    weeks.forEach((week, weekIndex) => {
      if (weekIndex > 0) doc.addPage();

      doc.setFontSize(16);
      doc.text(`Cuadrante ${viewMode === 'week' ? 'Semanal' : viewMode === 'fortnight' ? 'Quincenal' : 'Mensual'} - ${monthYear}`, 14, 15);
      doc.setFontSize(10);
      if (viewMode !== 'month') {
        doc.text(`${viewMode === 'week' ? 'Semana' : 'Quincena'} ${currentWeekIndex + 1}`, 14, 22);
      }

      const tableData: any[][] = [];
      const headers = ['Empleado', ...week.map(d => format(d, 'EEEE d', { locale: es }))];

      employees.forEach(emp => {
        const row = [
          { content: `${emp.firstName} ${emp.lastName}`, styles: { fontStyle: 'bold' } },
          ...week.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const shift = quadrant.find(s => s.employeeId === emp.id && s.date === dateStr);
            return shift?.type === 'OFF' ? '-' : (shift?.type || '-');
          })
        ];
        tableData.push(row);
      });

      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 28,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [62, 39, 35], textColor: 255 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index > 0) {
            const val = data.cell.text[0];
            if (val === 'M') data.cell.styles.fillColor = [239, 235, 233]; // Coffee 50
            if (val === 'T') data.cell.styles.fillColor = [254, 249, 195]; // Yellow
            if (val === 'P') data.cell.styles.fillColor = [255, 237, 213]; // Orange
            if (val === 'VAC') data.cell.styles.fillColor = [215, 204, 200]; // Coffee 100
            if (val === 'BAJA') data.cell.styles.fillColor = [254, 226, 226];
          }
        }
      });
    });

    doc.save(`${title}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      <AnimatePresence mode="wait">
        {step === 'landing' ? (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-coffee-50 flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full bg-white rounded-[40px] p-10 shadow-2xl shadow-coffee-200 border border-coffee-100">
              <div className="w-20 h-20 bg-coffee-800 rounded-3xl flex items-center justify-center text-white mb-8 mx-auto shadow-lg shadow-coffee-200">
                <ChefHat className="w-10 h-10" />
              </div>
              <h1 className="text-4xl font-black text-center text-coffee-900 mb-4 tracking-tight">Staffore</h1>
              <p className="text-center text-gray-500 mb-10 leading-relaxed">Optimización inteligente de turnos para restauración organizada.</p>
              
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Usuario</label>
                  <input 
                    type="text" 
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className="w-full p-4 rounded-2xl border border-gray-100 focus:border-coffee-800 outline-none transition-all bg-gray-50 text-center text-xl font-bold tracking-widest"
                  />
                  {loginError && <p className="text-red-500 text-xs mt-2 text-center font-medium">{loginError}</p>}
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-coffee-800 text-white py-5 rounded-2xl font-black text-lg hover:bg-coffee-900 transition-all shadow-xl shadow-coffee-200 flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  Entrar <ChevronRight className="w-6 h-6" />
                </button>
              </form>
              
              <div className="mt-10 pt-8 border-t border-gray-50 text-center">
                <p className="text-xs text-gray-400 font-medium">© 2026 Staffore AI Solutions - Hand made by smileconsultores</p>
              </div>
            </div>
          </motion.div>
        ) : step === 'setup' ? (
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
                  <h1 className="text-3xl font-bold tracking-tight">Staffore</h1>
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
                      setupStep >= s ? "bg-coffee-800" : "bg-gray-100"
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
                            config.hasSplitShifts ? "border-coffee-800 bg-coffee-50 text-coffee-900" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                          Sí (M, T, P)
                        </button>
                        <button 
                          onClick={() => setConfig({...config, hasSplitShifts: false})}
                          className={cn(
                            "flex-1 py-4 rounded-2xl border-2 transition-all font-medium",
                            !config.hasSplitShifts ? "border-coffee-800 bg-coffee-50 text-coffee-900" : "border-gray-100 hover:border-gray-200"
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
                              config.restDaysPerWeek === d ? "border-coffee-800 bg-coffee-50 text-coffee-900" : "border-gray-100 hover:border-gray-200"
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
                            config.contiguousRestDays ? "border-coffee-800 bg-coffee-50 text-coffee-900" : "border-gray-100 hover:border-gray-200"
                          )}
                        >
                          Sí
                        </button>
                        <button 
                          onClick={() => setConfig({...config, contiguousRestDays: false})}
                          className={cn(
                            "flex-1 py-4 rounded-2xl border-2 transition-all font-medium",
                            !config.contiguousRestDays ? "border-coffee-800 bg-coffee-50 text-coffee-900" : "border-gray-100 hover:border-gray-200"
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
                      <label className="block text-sm font-semibold uppercase tracking-wider text-gray-400">Objetivo Ventas Mensual (Bruto €)</label>
                      <input 
                        type="number"
                        className="w-full p-4 rounded-2xl border-2 border-gray-100 focus:border-coffee-800 outline-none transition-all"
                        value={config.salesTarget}
                        onChange={(e) => setConfig({...config, salesTarget: Number(e.target.value)})}
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="block text-sm font-semibold uppercase tracking-wider text-gray-400">Tipo de IVA (%)</label>
                      <select 
                        className="w-full p-4 rounded-2xl border-2 border-gray-100 focus:border-emerald-500 outline-none transition-all bg-white"
                        value={config.vatRate}
                        onChange={(e) => setConfig({...config, vatRate: Number(e.target.value)})}
                      >
                        <option value={10}>10% (Restauración)</option>
                        <option value={21}>21% (General)</option>
                        <option value={4}>4% (Superreducido)</option>
                        <option value={0}>0% (Exento)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-6 pt-8 border-t border-gray-100">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Clock className="w-5 h-5 text-coffee-800" />
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
                          <Save className="w-4 h-4 text-coffee-800" />
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
                          <input type="date" id="vacation-start" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Fin</label>
                          <input type="date" id="vacation-end" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                        </div>
                        <button 
                          onClick={() => {
                            const empSelect = document.getElementById('vacation-employee-select') as HTMLSelectElement;
                            const startInput = document.getElementById('vacation-start') as HTMLInputElement;
                            const endInput = document.getElementById('vacation-end') as HTMLInputElement;
                            
                            const empId = empSelect.value;
                            const start = startInput.value;
                            const end = endInput.value;
                            
                            if (!empId || !start || !end) return;
                            
                            const startDate = new Date(start);
                            const endDate = new Date(end);
                            const dates: string[] = [];
                            let curr = new Date(startDate);
                            
                            while (curr <= endDate) {
                              dates.push(format(curr, 'yyyy-MM-dd'));
                              curr.setDate(curr.getDate() + 1);
                            }
                            
                            setAllEmployees(prev => prev.map(emp => {
                              if (emp.id === empId) {
                                return {
                                  ...emp,
                                  vacationDates: Array.from(new Set([...emp.vacationDates, ...dates]))
                                };
                              }
                              return emp;
                            }));
                            
                            const updatedEmployees = employees.map(emp => {
                              if (emp.id === empId) {
                                return {
                                  ...emp,
                                  vacationDates: Array.from(new Set([...emp.vacationDates, ...dates]))
                                };
                              }
                              return emp;
                            });
                            
                            // Clear inputs
                            empSelect.value = "";
                            startInput.value = "";
                            endInput.value = "";

                            // Regenerate if quadrant exists
                            if (quadrant.length > 0) {
                              generateQuadrant(updatedEmployees);
                            }
                          }}
                          className="bg-emerald-500 text-white p-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center"
                        >
                          Añadir Rango
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {employees.map(emp => (
                        <div key={emp.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 group hover:border-coffee-200 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-coffee-100 rounded-full flex items-center justify-center text-coffee-900 font-bold">
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
                      <li>• Objetivo: {config.salesTarget}€ / mes (Bruto)</li>
                      <li>• IVA: {config.vatRate}%</li>
                      <li>• Coste Objetivo: {config.targetPersonnelCost}%</li>
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
                      className="bg-coffee-800 text-white px-12 py-4 rounded-2xl font-bold hover:bg-coffee-900 transition-all shadow-lg shadow-coffee-200"
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
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-12">
                  <div className="w-10 h-10 bg-coffee-800 rounded-xl flex items-center justify-center text-white shadow-lg shadow-coffee-200">
                    <ChefHat className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-black text-xl tracking-tight">Staffore</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Admin Panel</p>
                  </div>
                </div>

                {currentUser?.role === 'admin' && (
                  <div className="mb-8 space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 ml-1">Localización</label>
                    <div className="grid grid-cols-2 gap-2">
                      {BUSINESS_UNITS.map(unit => (
                        <button
                          key={unit.id}
                          onClick={() => setCurrentUnitId(unit.id)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-[10px] font-bold transition-all border",
                            currentUnitId === unit.id 
                              ? "bg-coffee-800 text-white border-coffee-800 shadow-md" 
                              : "bg-white text-gray-500 border-gray-100 hover:bg-gray-50"
                          )}
                        >
                          {unit.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <nav className="space-y-2 flex-1">
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
                    icon={<Settings className="w-5 h-5" />} 
                    label="Ajustes" 
                    active={activeTab === 'settings'} 
                    onClick={() => setActiveTab('settings')}
                  />
                  <SidebarItem 
                    icon={<TrendingUp className="w-5 h-5" />} 
                    label="Analíticas" 
                    active={activeTab === 'analytics'} 
                    onClick={() => setActiveTab('analytics')}
                  />
                </nav>

                <div className="pt-8 mt-8 border-t border-gray-50">
                  <button 
                    onClick={() => {
                      setCurrentUser(null);
                      setStep('landing');
                      setLoginId('');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all font-medium"
                  >
                    <Trash2 className="w-5 h-5" />
                    Cerrar Sesión ({currentUser?.id})
                  </button>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-10">
              <div className="flex justify-center mb-8">
                <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex items-center gap-6 min-w-[300px]">
                  <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Coste de Personal</p>
                    <div className="flex items-baseline gap-2">
                      <p className={cn(
                        "text-3xl font-black transition-colors duration-300",
                        Number(laborCostStats.percentage) > 39 ? "text-red-500" : "text-emerald-500"
                      )}>
                        {laborCostStats.percentage}%
                      </p>
                      <p className="text-xs text-gray-400">s/ ventas netas</p>
                    </div>
                  </div>
                  <div className="flex-1 ml-4">
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          Number(laborCostStats.percentage) > 39 ? "bg-red-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(Number(laborCostStats.percentage), 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <header className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">
                    {activeTab === 'quadrant' && 'Gestión de Cuadrante'}
                    {activeTab === 'employees' && 'Gestión de Equipo'}
                    {activeTab === 'analytics' && 'Análisis de Eficiencia'}
                    {activeTab === 'settings' && 'Configuración General'}
                  </h2>
                  <p className="text-gray-500">
                    {activeTab === 'quadrant' && 'Periodo desde el ' + format(currentPeriodStart, "d 'de' MMMM", { locale: es })}
                    {activeTab === 'employees' && 'Administra los perfiles y jornadas de tu personal'}
                    {activeTab === 'analytics' && 'Predicciones de IA y control de costes'}
                    {activeTab === 'settings' && 'Personaliza las reglas de negocio'}
                  </p>
                </div>
                
                <div className="flex gap-3">
                  {activeTab === 'quadrant' && (
                    <>
                      <div className="flex bg-white border border-gray-200 rounded-2xl p-1 shadow-sm items-center gap-1">
                        <button 
                          onClick={() => {
                            const [y, m] = selectedMonth.split('-').map(Number);
                            const d = new Date(y, m - 2, 1);
                            setSelectedMonth(format(d, 'yyyy-MM'));
                            setCurrentWeekIndex(0);
                          }}
                          className="p-2 hover:bg-gray-50 rounded-xl transition-all"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <input 
                          type="month" 
                          value={selectedMonth}
                          onChange={(e) => {
                            setSelectedMonth(e.target.value);
                            setCurrentWeekIndex(0);
                          }}
                          className="bg-transparent border-none outline-none text-xs font-bold px-2 py-1 cursor-pointer"
                        />
                        <button 
                          onClick={() => {
                            const [y, m] = selectedMonth.split('-').map(Number);
                            const d = new Date(y, m, 1);
                            setSelectedMonth(format(d, 'yyyy-MM'));
                            setCurrentWeekIndex(0);
                          }}
                          className="p-2 hover:bg-gray-50 rounded-xl transition-all"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      <button 
                        onClick={publishQuadrant}
                        disabled={isPublished}
                        className={cn(
                          "p-3 rounded-2xl transition-all shadow-sm flex items-center gap-2 text-sm font-bold",
                          isPublished 
                            ? "bg-green-50 text-green-700 border border-green-200" 
                            : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                        )}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        {isPublished ? 'Cuadrante Publicado' : 'Publicar Cuadrante'}
                      </button>
                      <div className="flex bg-white border border-gray-200 rounded-2xl p-1 shadow-sm">
                        {(['week', 'fortnight', 'month'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => {
                              setViewMode(mode);
                              setCurrentWeekIndex(0);
                            }}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                              viewMode === mode ? "bg-coffee-800 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
                            )}
                          >
                            {mode === 'week' ? 'Semana' : mode === 'fortnight' ? 'Quincena' : 'Mes'}
                          </button>
                        ))}
                      </div>

                      {viewMode !== 'month' && (
                        <div className="flex bg-white border border-gray-200 rounded-2xl p-1 shadow-sm items-center gap-1">
                          <button 
                            onClick={() => setCurrentWeekIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentWeekIndex === 0}
                            className="p-2 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-30"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-[10px] font-bold px-2">
                            {viewMode === 'week' ? `Semana ${currentWeekIndex + 1}` : `Quincena ${currentWeekIndex + 1}`}
                          </span>
                          <button 
                            onClick={() => {
                              const maxIndex = viewMode === 'week' ? Math.floor(periodDays.length / 7) - 1 : Math.floor(periodDays.length / 14) - 1;
                              setCurrentWeekIndex(prev => Math.min(maxIndex, prev + 1));
                            }}
                            className="p-2 hover:bg-gray-50 rounded-xl transition-all"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <button 
                        onClick={downloadPDF}
                        className="bg-white border border-gray-200 p-3 rounded-2xl hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2 text-sm font-bold"
                      >
                        <Download className="w-5 h-5 text-blue-500" /> Descargar PDF
                      </button>
                    </>
                  )}
                  <button 
                    onClick={analyzeWithAI}
                    className="bg-white border border-gray-200 p-3 rounded-2xl hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2 text-sm font-bold"
                  >
                    <TrendingUp className="w-5 h-5 text-coffee-800" /> Analizar con IA
                  </button>
                  <button 
                    onClick={() => generateQuadrant()}
                    disabled={isGenerating || isPublished}
                    className="bg-coffee-800 text-white px-6 py-3 rounded-2xl font-bold hover:bg-coffee-900 transition-all shadow-lg shadow-coffee-200 flex items-center gap-2 disabled:opacity-50"
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
                    <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden flex flex-col">
                      <div className="overflow-x-auto">
                        <div className="min-w-max">
                          <div className="flex border-b border-gray-100 bg-gray-50/50 sticky top-0 z-20">
                            <div className="w-48 p-4 font-bold text-xs uppercase tracking-wider text-gray-400 border-r border-gray-100 bg-gray-50/50 sticky left-0 z-30">Empleado</div>
                            {displayedDays.map(day => (
                              <div key={day.toString()} className="w-12 p-3 text-center border-r border-gray-100 last:border-r-0 flex flex-col items-center justify-center">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{format(day, 'EEEEE', { locale: es })}</p>
                                <p className="text-sm font-black">{format(day, 'd')}</p>
                              </div>
                            ))}
                          </div>

                          <div className="divide-y divide-gray-100">
                            {employees.map(emp => (
                              <div key={emp.id} className="flex border-b border-gray-100 last:border-b-0 group">
                                    <div className="w-48 p-3 border-r border-gray-100 flex items-center gap-3 sticky left-0 z-10 bg-white group-hover:bg-gray-50 transition-colors">
                                      <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 relative",
                                        emp.position === 'cocina' ? "bg-orange-100 text-orange-700" : 
                                        emp.position === 'sala' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                      )}>
                                        {emp.firstName[0]}{emp.lastName[0]}
                                        {emp.isRefuerzo && (
                                          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
                                        )}
                                      </div>
                                      <div className="truncate">
                                        <p className="font-bold text-xs truncate">{emp.firstName} {emp.lastName}</p>
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">{emp.weeklyHours}h</p>
                                      </div>
                                    </div>
                                    {displayedDays.map(day => {
                                      const dateStr = format(day, 'yyyy-MM-dd');
                                      const shift = quadrant.find(s => s.employeeId === emp.id && s.date === dateStr);
                                      
                                      // Check for T -> M conflict (minimum rest)
                                      const prevDate = format(addDays(day, -1), 'yyyy-MM-dd');
                                      const prevShift = quadrant.find(s => s.employeeId === emp.id && s.date === prevDate);
                                      const isConflict = shift?.type === 'M' && prevShift?.type === 'T';

                                      return (
                                        <div key={day.toString()} className="w-12 p-1 border-r border-gray-100 last:border-r-0 flex items-center justify-center bg-white group-hover:bg-gray-50 transition-colors">
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
                          </div>
                        </div>
                      </div>
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
                            className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
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
                          <input type="date" id="medical-start" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Fin</label>
                          <input type="date" id="medical-end" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                        </div>
                        <button 
                          onClick={() => {
                            const empSelect = document.getElementById('medical-employee-select') as HTMLSelectElement;
                            const startInput = document.getElementById('medical-start') as HTMLInputElement;
                            const endInput = document.getElementById('medical-end') as HTMLInputElement;

                            const empId = empSelect.value;
                            const start = startInput.value;
                            const end = endInput.value;
                            
                            if (!empId || !start || !end) return;
                            
                            const startDate = new Date(start);
                            const endDate = new Date(end);
                            const dates: string[] = [];
                            let curr = new Date(startDate);
                            
                            while (curr <= endDate) {
                              dates.push(format(curr, 'yyyy-MM-dd'));
                              curr.setDate(curr.getDate() + 1);
                            }
                            
                            setAllEmployees(prev => prev.map(emp => {
                              if (emp.id === empId) {
                                return {
                                  ...emp,
                                  medicalLeaveDates: Array.from(new Set([...(emp.medicalLeaveDates || []), ...dates]))
                                };
                              }
                              return emp;
                            }));
                            
                            const updatedEmployees = employees.map(emp => {
                              if (emp.id === empId) {
                                return {
                                  ...emp,
                                  medicalLeaveDates: Array.from(new Set([...(emp.medicalLeaveDates || []), ...dates]))
                                };
                              }
                              return emp;
                            });
                            
                            // Clear inputs
                            empSelect.value = "";
                            startInput.value = "";
                            endInput.value = "";
                            
                            // Trigger regeneration with updated data
                            generateQuadrant(updatedEmployees);
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
                      <div className="bg-coffee-50 border border-coffee-100 rounded-3xl p-6 flex gap-4">
                        <div className="w-12 h-12 bg-coffee-800 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-coffee-200">
                          <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-coffee-900">Objetivo de Coste</h4>
                          <p className="text-sm text-coffee-800 opacity-80">
                            {Number(laborCostStats.percentage) <= config.targetPersonnelCost 
                              ? `Estás un ${(config.targetPersonnelCost - Number(laborCostStats.percentage)).toFixed(1)}% por debajo del límite de coste de personal. ¡Buen trabajo!`
                              : `Estás un ${(Number(laborCostStats.percentage) - config.targetPersonnelCost).toFixed(1)}% por encima del límite de coste de personal.`}
                          </p>
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
                        <div className="flex gap-3">
                          {currentUser?.role === 'admin' && (
                            <label className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-50 transition-all cursor-pointer shadow-sm">
                              <Save className="w-4 h-4 text-coffee-800" /> Subir Excel
                              <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
                            </label>
                          )}
                          <button 
                            onClick={() => {
                              // Logic to open a modal or scroll to form could go here
                              // For now we'll just alert or we could add a state to show/hide form
                              const formElement = document.getElementById('employee-form-container');
                              if (formElement) formElement.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="bg-coffee-800 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-coffee-900 transition-all"
                          >
                            <Plus className="w-4 h-4" /> Nuevo Empleado
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {employees.map(emp => (
                          <div key={emp.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:border-coffee-200 transition-all group">
                            <div className="flex items-start justify-between mb-4">
                              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-coffee-800 font-bold text-xl shadow-sm border border-gray-100 relative">
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
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Añadir Planificación de Vacaciones</h3>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Empleado</label>
                              <select 
                                className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
                                id="tab-vacation-employee-select"
                              >
                                <option value="">Seleccionar empleado...</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Inicio</label>
                                <input type="date" id="tab-vacation-start" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Fin</label>
                                <input type="date" id="tab-vacation-end" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                const empSelect = document.getElementById('tab-vacation-employee-select') as HTMLSelectElement;
                                const startInput = document.getElementById('tab-vacation-start') as HTMLInputElement;
                                const endInput = document.getElementById('tab-vacation-end') as HTMLInputElement;
                                
                                const empId = empSelect.value;
                                const start = startInput.value;
                                const end = endInput.value;
                                
                                if (!empId || !start || !end) return;
                                
                                const startDate = new Date(start);
                                const endDate = new Date(end);
                                const dates: string[] = [];
                                let curr = new Date(startDate);
                                
                                while (curr <= endDate) {
                                  dates.push(format(curr, 'yyyy-MM-dd'));
                                  curr.setDate(curr.getDate() + 1);
                                }
                                
                                setAllEmployees(prev => prev.map(emp => {
                                  if (emp.id === empId) {
                                    return {
                                      ...emp,
                                      vacationDates: Array.from(new Set([...emp.vacationDates, ...dates]))
                                    };
                                  }
                                  return emp;
                                }));
                                
                                const updatedEmployees = employees.map(emp => {
                                  if (emp.id === empId) {
                                    return {
                                      ...emp,
                                      vacationDates: Array.from(new Set([...emp.vacationDates, ...dates]))
                                    };
                                  }
                                  return emp;
                                });
                                
                                empSelect.value = "";
                                startInput.value = "";
                                endInput.value = "";

                                if (quadrant.length > 0) {
                                  generateQuadrant(updatedEmployees);
                                }
                              }}
                              className="w-full bg-coffee-800 text-white p-3 rounded-xl font-bold hover:bg-coffee-900 transition-all shadow-lg shadow-coffee-100 flex items-center justify-center"
                            >
                              Registrar Vacaciones
                            </button>
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Añadir Baja Médica</h3>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Empleado</label>
                              <select 
                                className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
                                id="tab-medical-employee-select"
                              >
                                <option value="">Seleccionar empleado...</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                                ))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Inicio</label>
                                <input type="date" id="tab-medical-start" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha Fin</label>
                                <input type="date" id="tab-medical-end" className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm" />
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                const empSelect = document.getElementById('tab-medical-employee-select') as HTMLSelectElement;
                                const startInput = document.getElementById('tab-medical-start') as HTMLInputElement;
                                const endInput = document.getElementById('tab-medical-end') as HTMLInputElement;
                                
                                const empId = empSelect.value;
                                const start = startInput.value;
                                const end = endInput.value;
                                
                                if (!empId || !start || !end) return;
                                
                                const startDate = new Date(start);
                                const endDate = new Date(end);
                                const dates: string[] = [];
                                let curr = new Date(startDate);
                                
                                while (curr <= endDate) {
                                  dates.push(format(curr, 'yyyy-MM-dd'));
                                  curr.setDate(curr.getDate() + 1);
                                }
                                
                                setAllEmployees(prev => prev.map(emp => {
                                  if (emp.id === empId) {
                                    return {
                                      ...emp,
                                      medicalLeaveDates: Array.from(new Set([...(emp.medicalLeaveDates || []), ...dates]))
                                    };
                                  }
                                  return emp;
                                }));
                                
                                const updatedEmployees = employees.map(emp => {
                                  if (emp.id === empId) {
                                    return {
                                      ...emp,
                                      medicalLeaveDates: Array.from(new Set([...(emp.medicalLeaveDates || []), ...dates]))
                                    };
                                  }
                                  return emp;
                                });
                                
                                empSelect.value = "";
                                startInput.value = "";
                                endInput.value = "";

                                if (quadrant.length > 0) {
                                  generateQuadrant(updatedEmployees);
                                }
                              }}
                              className="w-full bg-red-500 text-white p-3 rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100 flex items-center justify-center"
                            >
                              Registrar Baja
                            </button>
                          </div>
                        </div>
                      </div>

                      <div id="employee-form-container" className="pt-8 mt-8 border-t border-gray-100">
                        <h3 className="text-lg font-bold mb-6">Añadir Nuevo Empleado</h3>
                        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                          <EmployeeForm onAdd={addEmployee} />
                        </div>
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
                            <Bar dataKey="cost" fill="#4B2C20" radius={[4, 4, 0, 0]} barSize={40}>
                              {[0,1,2,3,4,5,6].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 4 || index === 5 ? '#4B2C20' : '#E2E8F0'} />
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
                                    <div className="p-4 bg-coffee-50 rounded-2xl border border-coffee-100">
                                      <div className="flex items-center gap-3 mb-2">
                                        <TrendingUp className="w-5 h-5 text-coffee-800" />
                                        <span className="font-bold text-coffee-900">Eficiencia de Costes</span>
                                      </div>
                                      <p className="text-sm text-coffee-800">{data.costEfficiency}</p>
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
                                <CheckCircle2 className="w-5 h-5 text-coffee-800" />
                                <span className="font-bold text-coffee-900">Eficiencia Óptima</span>
                              </div>
                              <p className="text-sm text-coffee-800">Tu cuadrante actual cubre el 98% de la demanda estimada basada en históricos.</p>
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
                            <div className="p-4 bg-gray-50 rounded-2xl">
                              <p className="text-xl font-black">{config.salesTarget.toLocaleString()}€</p>
                              <p className="text-xs text-gray-500">Ventas Brutas (Mes)</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-2xl">
                              <p className="text-xl font-black">{laborCostStats.netSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}€</p>
                              <p className="text-xs text-gray-500">Ventas Netas (Mes)</p>
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
                        <Settings className="w-6 h-6 text-coffee-800" />
                        Configuración del Restaurante
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Objetivo Ventas Mensual (Bruto €)</label>
                            <input 
                              type="number"
                              className="w-full p-4 rounded-2xl border border-gray-100 focus:border-coffee-800 outline-none transition-all bg-gray-50"
                              value={config.salesTarget}
                              onChange={(e) => setConfig({...config, salesTarget: Number(e.target.value)})}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Tipo de IVA (%)</label>
                            <select 
                              className="w-full p-4 rounded-2xl border border-gray-100 focus:border-coffee-800 outline-none transition-all bg-gray-50"
                              value={config.vatRate}
                              onChange={(e) => setConfig({...config, vatRate: Number(e.target.value)})}
                            >
                              <option value={10}>10% (Restauración)</option>
                              <option value={21}>21% (General)</option>
                              <option value={4}>4% (Superreducido)</option>
                              <option value={0}>0% (Exento)</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Coste Personal Objetivo (%)</label>
                            <input 
                              type="number"
                              step="0.1"
                              className="w-full p-4 rounded-2xl border border-gray-100 focus:border-coffee-800 outline-none transition-all bg-gray-50"
                              value={config.targetPersonnelCost}
                              onChange={(e) => setConfig({...config, targetPersonnelCost: Number(e.target.value)})}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Día de Cierre</label>
                            <select 
                              className="w-full p-4 rounded-2xl border border-gray-100 focus:border-coffee-800 outline-none transition-all bg-gray-50"
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
                                config.hasSplitShifts ? "bg-coffee-800" : "bg-gray-200"
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
          ? "bg-coffee-50 text-coffee-800 shadow-sm border border-coffee-100" 
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
    
    const calculatedMonthlyCost = (formData.weeklyHours / 40) * 2000;
    
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
      isRefuerzo: formData.isRefuerzo,
      monthlyCost: calculatedMonthlyCost,
      businessUnitId: '' // Will be set by onAdd
    });
    
    setFormData({ ...formData, firstName: '', lastName: '', isRefuerzo: false, weeklyHours: 40, restDays: 2, vacations: 30, position: 'sala' });
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4 items-end">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nombre</label>
        <input 
          type="text" 
          placeholder="Nombre"
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
          value={formData.firstName}
          onChange={e => setFormData({...formData, firstName: e.target.value})}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Apellidos</label>
        <input 
          type="text" 
          placeholder="Apellidos"
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
          value={formData.lastName}
          onChange={e => setFormData({...formData, lastName: e.target.value})}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Posición</label>
        <select 
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
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
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
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
          className="w-full p-3 rounded-xl border border-gray-200 focus:border-coffee-800 outline-none bg-white text-sm"
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
          className="w-6 h-6 accent-coffee-800 cursor-pointer"
          checked={formData.isRefuerzo}
          onChange={e => setFormData({...formData, isRefuerzo: e.target.checked})}
        />
      </div>
      <button 
        type="submit"
        className="bg-coffee-800 text-white p-3 rounded-xl font-bold hover:bg-coffee-900 transition-all shadow-lg shadow-coffee-200 flex items-center justify-center"
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
      case 'M': return "bg-coffee-100 text-coffee-800 border-coffee-200"; // Coffee
      case 'T': return "bg-yellow-100 text-yellow-700 border-yellow-200"; // Yellow
      case 'P': return "bg-orange-100 text-orange-700 border-orange-200"; // Orange
      case 'VAC': return "bg-blue-100 text-blue-700 border-blue-200";
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
        "w-full h-10 rounded-lg border text-xs font-black transition-all flex items-center justify-center relative",
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
