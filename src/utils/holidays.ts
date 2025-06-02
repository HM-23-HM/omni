import Holidays from 'date-holidays';

const currentYear = new Date().getFullYear();
const hd = new Holidays('JM');

const holidays = hd.getHolidays(currentYear);

export const isHoliday = (): boolean => {
    const jamaicaDate = new Date().toLocaleString('en-US', { 
        timeZone: 'America/Jamaica'
    });
    const today = new Date(jamaicaDate);
    const todayFormatted = today.toISOString().split('T')[0];
    
    return holidays.some(holiday => {
        const dateMatch = holiday.date.match(/^\d{4}-\d{2}-\d{2}/);
        return dateMatch && dateMatch[0] === todayFormatted;
    });
};

