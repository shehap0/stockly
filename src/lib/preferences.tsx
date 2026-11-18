import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { PreferencesContext, type Language, type Preferences, type Theme } from './preferences-context'
import { usePreferences } from './usePreferences'

const translations: Record<string, string> = {
  'All branches': 'كل الفروع', 'Adjust':'تعديل', 'Your branch': 'فرعك', Workspace: 'مساحة العمل',
  Dashboard: 'لوحة التحكم', Inventory: 'المخزون', Sales: 'المبيعات', 'Sales history': 'سجل المبيعات', 'New sale': 'بيع جديد',
  Products: 'المنتجات', Customers: 'العملاء', Reports: 'التقارير', Manage: 'الإدارة',
  Administration: 'إدارة النظام', 'Sign out': 'تسجيل الخروج', Owner: 'مالك', Employee: 'موظف',
  'All branches · Owner': 'كل الفروع · مالك', 'Email or phone number': 'البريد الإلكتروني أو رقم الهاتف',
  Password: 'كلمة المرور', 'Sign in': 'تسجيل الدخول', 'Forgot password?': 'هل نسيت كلمة المرور؟',
  'Reset password': 'إعادة تعيين كلمة المرور', 'We will email you a password-reset link.': 'سنرسل رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.',
  Email: 'البريد الإلكتروني', 'Send reset link': 'إرسال رابط إعادة التعيين', 'Set a new password': 'تعيين كلمة مرور جديدة',
  'New password': 'كلمة المرور الجديدة', 'Confirm password': 'تأكيد كلمة المرور', 'Update password': 'تحديث كلمة المرور',
  'Loading…': 'جارٍ التحميل…', 'Not authorized.': 'غير مصرح لك.', 'Search': 'بحث', 'Search…': 'بحث…',
  'Add product': 'إضافة منتج', 'New product': 'منتج جديد', 'Save': 'حفظ', 'Cancel': 'إلغاء', 'Delete': 'حذف',
  'Name': 'الاسم', 'Category': 'الفئة', 'Branch': 'الفرع', 'Quantity': 'الكمية', 'Price': 'السعر',
  'Selling price': 'سعر البيع', 'Purchase cost': 'تكلفة الشراء', 'SKU': 'رمز المنتج', 'Barcode': 'الباركود',
  'Description': 'الوصف', 'Actions': 'الإجراءات', 'Status': 'الحالة', 'Date': 'التاريخ', 'Payment': 'الدفع',
  'Customer': 'العميل', 'Total': 'الإجمالي', 'Subtotal': 'المجموع الفرعي', 'Discount': 'الخصم',
  'Cash': 'نقدي', 'Card': 'بطاقة', 'Complete sale': 'إتمام البيع', 'Add to cart': 'أضف إلى السلة',
  'InstaPay': 'إنستاباي', INSTAPAY: 'إنستاباي', CASH: 'نقدي', CARD: 'بطاقة',
  'Add stock': 'إضافة مخزون', 'Adjust stock': 'تعديل المخزون', 'Low stock': 'مخزون منخفض',
  'Out of stock': 'نفد المخزون', 'Users': 'المستخدمون', 'Invite user': 'دعوة مستخدم', 'Team': 'الفريق',
  'Full name': 'الاسم الكامل', 'Phone number': 'رقم الهاتف', 'Role': 'الصلاحية', 'Active': 'نشط',
  'Branches': 'الفروع', 'Settings': 'الإعدادات', 'Audit log': 'سجل التدقيق', 'Add branch': 'إضافة فرع',
  'Create branch': 'إنشاء فرع', 'All time': 'كل الفترات', 'Today': 'اليوم', 'This week': 'هذا الأسبوع',
  'This month': 'هذا الشهر', 'Completed': 'مكتملة', 'Voided': 'ملغاة', 'Void sale': 'إلغاء البيع',
  'Reason': 'السبب', 'Submit': 'إرسال', 'No results found.': 'لم يتم العثور على نتائج.',
  'No products yet.': 'لا توجد منتجات بعد.', 'No sales yet.': 'لا توجد مبيعات بعد.',
  'Welcome back': 'مرحبًا بعودتك', 'Email or +20 100 000 0000': 'البريد أو +20 100 000 0000',
  'Signing in…': 'جارٍ تسجيل الدخول…', 'Business activity across your branches.': 'نشاط العمل عبر فروعك.',
  '＋ Record a sale': '＋ تسجيل عملية بيع', 'Stock needing attention': 'مخزون يحتاج إلى متابعة',
  Product: 'المنتج', Threshold: 'حد التنبيه', 'in stock': 'متوفر', items: 'عناصر', products: 'منتجات',
  'No matching products with stock at this branch.': 'لا توجد منتجات مطابقة ومتوفرة في هذا الفرع.',
  'Searching…': 'جارٍ البحث…', Cart: 'السلة', 'Cart is empty.': 'السلة فارغة.', Item: 'الصنف', Qty: 'الكمية', Line: 'الإجمالي',
  Add: 'إضافة', None: 'بدون', Percent: 'نسبة مئوية', 'Fixed EGP': 'مبلغ ثابت ج.م', 'Walk-in': 'عميل مباشر',
  '+ New customer': '+ عميل جديد', 'Product attributes': 'خصائص المنتج', Type: 'النوع', Required: 'مطلوب', Options: 'الخيارات', Order: 'الترتيب', Edit: 'تعديل',
  'No attribute definitions yet.': 'لا توجد خصائص معرفة بعد.', 'Only the owner can manage product attributes.': 'يمكن للمالك فقط إدارة خصائص المنتجات.',
  'Review completed and voided transactions.': 'راجع العمليات المكتملة والملغاة.', 'All statuses': 'كل الحالات', 'Sale #': 'رقم البيع', When: 'الوقت', Items: 'الأصناف',
  'Record a sale': 'تسجيل عملية بيع', 'Rename current locations or add a branch when you expand.': 'غيّر أسماء الفروع الحالية أو أضف فرعًا عند التوسع.',
  'Short code': 'الرمز المختصر', 'Branch name': 'اسم الفرع', Address: 'العنوان', 'Company-wide': 'على مستوى الشركة', 'Select…': 'اختر…',
  'Company settings': 'إعدادات الشركة', 'Last 200 entries. Audit records are immutable.': 'آخر ٢٠٠ سجل. سجلات التدقيق غير قابلة للتعديل.',
  'Action contains': 'الإجراء يحتوي على', 'Entity contains': 'العنصر يحتوي على', Filter: 'تصفية', 'No matching entries.': 'لا توجد سجلات مطابقة.',
  'Shared catalog and branch availability.': 'كتالوج مشترك ومخزون الفروع.', 'All categories': 'كل الفئات', 'Total stock': 'إجمالي المخزون', 'Stock per branch': 'المخزون حسب الفرع',
  'No customers found.': 'لم يتم العثور على عملاء.', Notes: 'ملاحظات', 'New customer': 'عميل جديد', 'Track branch quantities and record stock changes.': 'تابع كميات الفروع وسجل تغييرات المخزون.',
  Stock: 'المخزون', 'Other branches': 'الفروع الأخرى', 'Recent movements': 'آخر حركات المخزون', Change: 'التغيير', After: 'بعد التغيير',
  'Manual adjustment': 'تعديل يدوي', Damage: 'تالف', Other: 'أخرى', 'Sale return': 'مرتجع بيع', 'Product is flagged when stock is below this number.': 'يظهر تنبيه عندما يقل المخزون عن هذا الرقم.',
  'Only the owner can manage categories.': 'يمكن للمالك فقط إدارة الفئات.', 'Product categories': 'فئات المنتجات', 'No parent (top-level)': 'بدون فئة رئيسية', 'No categories yet.': 'لا توجد فئات بعد.',
  'Only the owner can manage the product catalog.': 'يمكن للمالك فقط إدارة كتالوج المنتجات.', 'Choose where the opening quantity will be stored. You can add stock to other branches later.': 'اختر الفرع الذي سيُسجل فيه المخزون الافتتاحي. يمكنك إضافة مخزون لفروع أخرى لاحقًا.',
  'Select a branch': 'اختر فرعًا', 'Opening quantity': 'الكمية الافتتاحية', Condition: 'الحالة', 'New': 'جديد', Used: 'مستعمل', Refurbished: 'مجدد',
  'Product image (JPEG/PNG/WebP, ≤2MB)': 'صورة المنتج (JPEG/PNG/WebP، حتى ٢ ميجابايت)',
  'Branch comparison': 'مقارنة الفروع', Revenue: 'الإيرادات', Transactions: 'العمليات', Units: 'الوحدات', 'Gross profit': 'إجمالي الربح',
  'Best-selling products': 'المنتجات الأكثر مبيعًا', 'No items sold in this period.': 'لا توجد مبيعات في هذه الفترة.', 'Daily sales': 'المبيعات اليومية', 'No sales in this period.': 'لا توجد مبيعات في هذه الفترة.',
  'Inventory alerts': 'تنبيهات المخزون', 'No low or out-of-stock products in scope.': 'لا توجد منتجات منخفضة أو نافدة في النطاق المحدد.',
  'Loading sale…': 'جارٍ تحميل عملية البيع…', 'Loading users…': 'جارٍ تحميل المستخدمين…', 'Loading customers…': 'جارٍ تحميل العملاء…',
  'Loading settings…': 'جارٍ تحميل الإعدادات…', 'Loading report…': 'جارٍ تحميل التقرير…', 'Loading audit log…': 'جارٍ تحميل سجل التدقيق…',
  'Invite staff by email so they can set a password. They can then sign in with their email or phone number. Deactivated users keep their data but lose access.': 'ادعُ الموظفين عبر البريد ليحددوا كلمة مرور. بعدها يمكنهم تسجيل الدخول بالبريد أو الهاتف. يحتفظ المستخدم المعطل ببياناته مع إيقاف وصوله.',
  'Add staff and send invite': 'إضافة موظف وإرسال دعوة', 'Sending invite…': 'جارٍ إرسال الدعوة…', 'Branch employee': 'موظف فرع',
  'active': 'نشط', 'Only the owner can void a sale': 'يمكن للمالك فقط إلغاء عملية بيع',
  'Light mode': 'الوضع الفاتح', 'Dark mode': 'الوضع الداكن', Language: 'اللغة', 'Toggle theme': 'تبديل المظهر',
  'LOW': 'منخفض', 'Line total': 'إجمالي السطر', 'Unit price': 'سعر الوحدة', 'Void reason': 'سبب الإلغاء',
  'Sale not found or you do not have access to it.': 'عملية البيع غير موجودة أو ليس لديك صلاحية لعرضها.',
  'Admin': 'الإدارة', 'Owner-only management.': 'إدارة خاصة بالمالك.', 'Rename': 'إعادة تسمية', 'Rename branch': 'إعادة تسمية الفرع',
  'inactive': 'غير نشط', 'Select a category': 'اختر فئة', 'Manufacturer': 'الشركة المصنعة', 'Brand': 'العلامة التجارية',
  'Car make': 'ماركة السيارة', 'Car model': 'طراز السيارة', 'Year': 'سنة الصنع', 'OEM number': 'رقم OEM', 'Product name': 'اسم المنتج',
  'Add customer': 'إضافة عميل', 'Customer name': 'اسم العميل', 'Phone': 'الهاتف',
  'Opening stock': 'المخزون الافتتاحي', 'Add quantity': 'إضافة كمية', 'Stock addition': 'إضافة مخزون',
  'Apply discount': 'تطبيق الخصم', 'Discount type': 'نوع الخصم', 'Discount value': 'قيمة الخصم', 'Payment method': 'طريقة الدفع',
  'No category': 'بدون فئة', 'Search products': 'ابحث عن المنتجات', 'Branch:': 'الفرع:', 'Voided:': 'ملغاة:',
  'Search by name, category, SKU, or barcode…': 'ابحث بالاسم أو الفئة أو SKU أو الباركود…',
  'Filter by category': 'تصفية حسب الفئة',
  'Review and sort completed and voided transactions.': 'راجع ورتّب العمليات المكتملة والملغاة.',
  'Sales today': 'مبيعات اليوم', 'Sales this week': 'مبيعات هذا الأسبوع', 'Sales this month': 'مبيعات هذا الشهر',
  'Gross profit (month)': 'إجمالي الربح (هذا الشهر)', 'From purchase-cost snapshots': 'استنادًا إلى تكاليف الشراء المسجلة',
  'Active products': 'المنتجات النشطة', 'Units in stock': 'الوحدات في المخزون',
  'Estimated inventory value': 'القيمة التقديرية للمخزون', 'At purchase cost': 'بحسب تكلفة الشراء',
  'At or below threshold': 'عند حد التنبيه أو أقل', 'Stock levels are healthy across your branches.': 'مستويات المخزون جيدة في جميع فروعك.',
  'transactions': 'عمليات', 'left': 'متبقي', 'Deactivate': 'الغاء التفعيل', Reactivate: 'تفعيل', 'deactivated': 'معطل',
  'Show deactivated': 'إظهار غير النشط', 'Category deactivated.': 'تم الغاء تفعيل الفئة.',
  'Attribute deactivated.': 'تم الغاء تفعيل الخاصية.', 'Your account is deactivated.': 'تم الغاء تفعيل حسابك.',
  'Add category': 'إضافة فئة', 'New category name': 'اسم الفئة الجديدة', 'Category created.': 'تم إنشاء الفئة.',
  'InstaPay payments': 'مدفوعات إنستاباي',
  'Delete user?': 'حذف المستخدم؟', 'Deleting…': 'جارٍ الحذف…',
}

const textOriginals = new WeakMap<Text, { original: string; translated: string }>()
const attrOriginals = new WeakMap<Element, Map<string, { original: string; translated: string }>>()

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => localStorage.getItem('stockly-language') === 'en' ? 'en' : 'ar')
  const [theme, setThemeState] = useState<Theme>(() => localStorage.getItem('stockly-theme') === 'dark' ? 'dark' : 'light')

  const setLanguage = (next: Language) => {
    localStorage.setItem('stockly-language', next)
    setLanguageState(next)
  }
  const setTheme = (next: Theme) => {
    localStorage.setItem('stockly-theme', next)
    setThemeState(next)
  }

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.dataset.theme = theme
  }, [language, theme])

  const value = useMemo<Preferences>(() => ({
    language, theme, setLanguage, setTheme,
    t: (text) => language === 'ar' ? translations[text] ?? text : text,
  }), [language, theme])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function PreferenceControls() {
  const { language, setLanguage, theme, setTheme, t } = usePreferences()
  return (
    <div className="preference-controls">
      <label className="sr-only" htmlFor="language-select">Language</label>
      <select id="language-select" value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language">
        <option value="ar">العربية</option><option value="en">English</option>
      </select>
      <button type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={t(theme === 'light' ? 'Dark mode' : 'Light mode')}>
        {t(theme === 'light' ? 'Dark mode' : 'Light mode')}
      </button>
    </div>
  )
}

export function LocalizedContent({ children }: { children: ReactNode }) {
  const { t } = usePreferences()
  useEffect(() => {
    const attributes = ['placeholder', 'aria-label', 'title', 'alt', 'value']

    const translateTree = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let textNode: Text | null
      while ((textNode = walker.nextNode() as Text | null)) {
        const previous = textOriginals.get(textNode)
        const original = previous && previous.translated === textNode.data ? previous.original : textNode.data
        const leading = original.match(/^\s*/)?.[0] ?? ''
        const trailing = original.match(/\s*$/)?.[0] ?? ''
        const clean = original.slice(leading.length, original.length - trailing.length || undefined)
        const translated = `${leading}${t(clean)}${trailing}`
        textOriginals.set(textNode, { original, translated })
        if (textNode.data !== translated) textNode.data = translated
      }

      const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : root.parentElement ? [root.parentElement] : []
      for (const element of elements) {
        let saved = attrOriginals.get(element)
        if (!saved) { saved = new Map(); attrOriginals.set(element, saved) }
        for (const attr of attributes) {
          const current = element.getAttribute(attr)
          if (current === null) continue
          const previous = saved.get(attr)
          const original = previous && previous.translated === current ? previous.original : current
          const translated = t(original)
          saved.set(attr, { original, translated })
          if (current !== translated) element.setAttribute(attr, translated)
        }
      }
    }

    translateTree(document.body)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') translateTree(record.target)
        else record.addedNodes.forEach(translateTree)
        if (record.type === 'attributes' && record.target instanceof Element) translateTree(record.target)
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes })
    return () => observer.disconnect()
  }, [t])
  return <>{children}</>
}
