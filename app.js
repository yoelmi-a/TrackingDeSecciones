import puppeteer from 'puppeteer';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function checkAvailability(page, subjects) {
    try {
        await page.waitForSelector('tr');

        // Recorre cada materia que el usuario desea verificar
        for (let i = 0; i < subjects.length; i++) {
            const subject = subjects[i];

            // Usamos page.evaluate para que la lógica de búsqueda de secciones se ejecute
            // eficientemente en el navegador.
            const subjectData = await page.evaluate((subjectToFind) => {
                // Esta función se ejecuta en el navegador.

                // Generamos los strings de búsqueda combinando nombre y sección
                const searchStrings = subjectToFind.sections.map(section => {
                    return `${subjectToFind.name} - ${section}`;
                });

                // Obtener todas las filas de la tabla
                const rows = document.querySelectorAll('tr');

                // Usar .filter() y .some() para encontrar las filas que coinciden con CUALQUIER
                // de los strings de búsqueda.
                const foundRows = Array.from(rows).filter(row =>
                    searchStrings.some(searchString =>
                        row.textContent.toLowerCase().includes(searchString.toLowerCase())
                    )
                );

                // Mapear las filas encontradas a un formato de datos más simple
                return foundRows.map(row => {
                    const inscritos = parseInt(row.querySelector('.inscritos')?.textContent, 10) || 0;
                    const cupo = parseInt(row.querySelector('.cupo')?.textContent, 10) || 0;
                    const nombreSeccion = row.querySelector('label.label')?.textContent || 'Sección Desconocida';
                    const checkbox = row.querySelector('input.seleccion');
                    // Si hay cupos y el checkbox no está deshabilitado
                    if (inscritos < cupo && checkbox && !checkbox.disabled) {
                        // Devolvemos un selector para el span.checkmark
                        return {
                            nombreSeccion,
                            inscritos,
                            cupo,
                            selectorToClick: `#${checkbox.id} + .checkmark`
                        };
                    }

                    return { nombreSeccion, inscritos, cupo, selectorToClick: null };
                });
            }, subject); // Pasamos el objeto 'subject' completo como argumento

            // Ahora, de vuelta en el contexto de Node.js, procesamos los resultados
            if (subjectData.length === 0) {
                console.log(`\n❌ No se encontraron secciones para ${subject.name}.`);
                continue; // Pasa a la siguiente materia
            }

            console.log(`\n🔎 Resultados para ${subject.name}:`);

            for (const data of subjectData) {

                if (data.inscritos < data.cupo) {
                    console.log(`   ✅ ${data.nombreSeccion} tiene cupos disponibles: ${data.inscritos}/${data.cupo}`);
                    try{

                    
                    await page.waitForSelector(data.selectorToClick, {visible: true, timeout: 5000});
                    await page.click(data.selectorToClick);
                    console.log(`   ✔️ Se ha seleccionado automáticamente la sección ${data.nombreSeccion}.`);
                    subjects.splice(i, 1); // Eliminar la materia ya seleccionada
                    i--;
                    break;
                    } catch(e){
                        console.error(`   ❌ No se pudo clickear ${data.nombreSeccion} ${data.inscritos}/${data.cupo}. Reintentando...`)
                    } // Salir del bucle for para pasar a la siguiente materia
                } else {
                    console.log(`   ❌ ${data.nombreSeccion} está llena: ${data.inscritos}/${data.cupo}`);
                }
                
            }
        }
    } catch (error) {
        console.error('Ocurrió un error al verificar los cursos:', error);
    }
}

async function selectionProcess(userData) {
    // Lanzar el navegador
    const browser = await puppeteer.launch({
        headless: true, // false para ver el navegador, true para ejecutar en segundo plano
        slowMo: 0 // Ralentizar las acciones para ver mejor lo que pasa
    });

    // Crear nueva página
    const page = await browser.newPage();
    // Navegar a una URL
    await page.goto('https://sigeiacademico.itla.edu.do/account/login');

    // Esperar a que cargue completamente
    //await page.waitForLoadState('networkidle');
    await page.waitForNetworkIdle();

    // Hacer clic en un elemento

    // Llenar formularios
    await page.type('#email', userData.email);
    await page.type('#password', userData.password);

    await page.click('#btnLogin');

    await page.waitForNavigation();
    console.log('✅ Inicio de sesión exitoso.')
    // Buscar por texto usando JavaScript
    await page.waitForSelector('.btn-lobby-container');

    const clicked = await page.evaluate(() => {
        // Find all links with the correct class
        const links = document.querySelectorAll('a.btn-lobby-container');
        // Iterate through them to find the one with the correct text
        const targetLink = Array.from(links).find(link => link.textContent.includes('SELECCIÓN DE ASIGNATURAS'));

        if (targetLink) {
            targetLink.click();
            return true;
        }
        return false;
    });

    if (clicked) {
        console.log('✅ Clic exitoso en "SELECCIÓN DE ASIGNATURAS".');
    } else {
        console.log('❌ El botón para seleccionar asignaturas no se pudo encontrar o cliquear.');
    }

    while (true) {

        if (userData.selections.length > 0) {

            for (const selection of userData.selections) {

                await page.waitForSelector(`a[href="#cuatrimestre${selection.quarter}"]`);
                await page.click(`a[href="#cuatrimestre${selection.quarter}"]`);
                console.log('🔄 Verificando disponibilidad...');
                await checkAvailability(page, selection.subjects);
                await page.reload();
            }
        }
        else {
            console.log('✅ Proceso de selección completado. No hay más asignaturas por seleccionar.');
            await browser.close();
            process.exit(0);
        }

    }
};

function askForHour(userData) {
    rl.question('Ingresa la hora de selección (HH:MM, formato 24 horas): ', (hourInput) => {
        const [hora, minuto] = hourInput.split(':').map(Number);

        if (isNaN(hora) || isNaN(minuto) || hora < 0 || hora > 23 || minuto < 0 || minuto > 59) {
            console.error('Error: Formato de hora inválido. Por favor, usa HH:MM.');
            return askForHour();
        }

        const ahora = new Date();
        const horaEjecucion = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), hora, minuto, 0);

        if (horaEjecucion.getTime() < ahora.getTime()) {
            horaEjecucion.setMinutes(horaEjecucion.getMinutes() + 1);
        }

        const tiempoRestante = horaEjecucion.getTime() - ahora.getTime();

        console.log(`\nLa tarea selección ha sido programada para: ${horaEjecucion.toLocaleString()}`);
        console.log(`Tiempo restante: ${Math.round(tiempoRestante / 1000)} segundos.`);

        setTimeout(async () => {
            console.log('\nIniciando proceso de selección de asignaturas...');
            await selectionProcess(userData);
            rl.close();
        }, tiempoRestante);
    });
}

function askForSubjects(subjects, quarter, onComplete) {
    rl.question('Ingresa la asignatura que deseas seleccionar: ', (subject) => {

        rl.question('Ingresa las secciones separadas por comas (ejemplo: 1, 2, 5): ', (sectionsInput) => {
            const sections = sectionsInput.split(',').map(s => s.trim());
            subjects.push({
                name: subject,
                sections: sections
            });

            rl.question(`¿Deseas agregar otra asignatura del cuatrimeste ${quarter}? (s/n): `, (more) => {
                if (more.toLowerCase() === 's') {
                    askForSubjects(subjects, quarter, onComplete);
                }
                else {
                    onComplete(subjects);
                }
            });

        });
    });
}

function askForSelection(selections, onComplete) {
    rl.question('Ingresa el cuatrimestre de la asignatura (ejemplo: 6): ', (quarter) => {
        const selection = {
            quarter: quarter,
            subjects: []
        }

        selections.push(selection);

        askForSubjects(selection.subjects, quarter, () => {

            rl.question('¿Deseas agregar materias de otro cuatrimestre? (s/n): ', (more) => {
                if (more.toLowerCase() === 's') {
                    askForSelection(selections, onComplete);
                }
                else {
                    onComplete(selections);
                }
            });
        });
    });
}


rl.question('Ingresa tu correo de SIGEI: ', (emailInput) => {

    rl.question('Ingresa tu contraseña de SIGEI: ', (passwordInput) => {
        const userData = {
            email: emailInput.toString(),
            password: passwordInput.toString(),
            selections: []
        }
        askForSelection(userData.selections, (selections) => {
            userData.selections = selections;
            console.log('\nConfiguración completa. Aquí están los detalles:');
            console.table(userData);
            askForHour(userData);
        });
    });
});
