/* ============================================================
   LÓGICA DE FACTURACIÓN HRS - HASHRATE SPACE
   ============================================================ */

const clientes = [
    { nombre: "INDICAR CLIENTE" },
    { nombre: "C01 - PIROTTO, PABLO" },
    { nombre: "C02 - CHABERT, SANTIAGO" },
    { nombre: "C03 - IRIGOYEN, MARTIN" },
    { nombre: "C04 - HAM, MATIAS" },
    { nombre: "C05 - CROSTA, MATIAS" },
    { nombre: "C06 - CABRERA, LEONARDO" },
    { nombre: "C07 - RIVERO, CLAUDIO" },
    { nombre: "C08 - PIROTTO, ANA LUCIA" },
    { nombre: "C09 - DAMASCO, MARCELO" },
    { nombre: "C10 - BAUER, ALEJANDRO" },
    { nombre: "C11 - MATIAS HAM Y GUILLERMO VILA" },
    { nombre: "C12 - VALDEZ, JOSE" },
    { nombre: "C13 - GANADERA CHIVILCOY" },
    { nombre: "C14 - LAZARO, AGUSTIN" },
    { nombre: "C15 - SOLER HOWARD, MARIA" },
    { nombre: "C105 - VILA SOLER, JOSE LUIS" }
];

const preciosServicios = { A: 100, B: 250, C: 500 };
let indiceAEliminar = null;

window.onload = () => {
    cargarClientes();
    generarNumeroFactura();
    actualizarTablaHistorial();
    
    const btnBorrarHistorial = document.getElementById('btnConfirmarBorradoFinal');
    if (btnBorrarHistorial) {
        btnBorrarHistorial.onclick = ejecutarEliminacionDefinitiva;
    }
};

/* --- NÚMERO CORRELATIVO --- */
function generarNumeroFactura() {
    const tipo = document.getElementById("tipoComprobante").value;
    const prefijo = (tipo === "Factura") ? "FC-" : "RC-";
    let historial = JSON.parse(localStorage.getItem("facturas_hrs")) || [];
    let filtrados = historial.filter(f => f.numero.startsWith(prefijo));

    let nuevoNumero = 1001;
    if (filtrados.length > 0) {
        let max = Math.max(...filtrados.map(f => parseInt(f.numero.split("-")[1])));
        nuevoNumero = max + 1;
    }
    document.getElementById("numeroFactura").value = prefijo + nuevoNumero;
}

/* --- CLIENTES --- */
function cargarClientes() {
    const select = document.getElementById("clienteSelect");
    if (!select) return;
    select.innerHTML = "";
    clientes.forEach((c, i) => select.add(new Option(c.nombre, i)));
}

function filtrarClientes() {
    const busqueda = document.getElementById("buscadorCliente").value.toLowerCase();
    const select = document.getElementById("clienteSelect");
    select.innerHTML = "";
    clientes.forEach((c, i) => {
        if (c.nombre.toLowerCase().includes(busqueda)) select.add(new Option(c.nombre, i));
    });
}

function seleccionarCliente() { }

/* --- MANEJO DE SERVICIOS --- */
function agregarServicio() {
    const tbody = document.getElementById("serviciosBody");
    const tr = document.createElement("tr");
    
    tr.innerHTML = `
        <td><select class="form-select form-select-sm servicioSelect" onchange="actualizarPrecio(this)">
            <option value="A">Bitmain Antminer L7 mhs</option>
            <option value="B">Bitmain Antminer L9 mhs</option>
            <option value="C">Bitmain Antminer S21 ths</option>
        </select></td>
        <td><input type="month" class="form-control form-control-sm mes"></td>
        <td><input type="number" class="form-control form-control-sm cant text-center" value="1" min="1" oninput="calcularFila(this)"></td>
        <td><input type="number" class="form-control form-control-sm precio text-center" readonly></td>
        <td><input type="number" class="form-control form-control-sm desc text-center" value="0" min="0" oninput="calcularFila(this)"></td>
        <td><input class="form-control form-control-sm fw-bold totalFila text-center" readonly value="0.00"></td>
        <td class="text-center">
            <button class="btn btn-sm btn-link text-danger p-0" onclick="eliminarFilaServicio(this)">
                <strong style="font-size: 1.2rem;">&times;</strong>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    actualizarPrecio(tr.querySelector(".servicioSelect"));
}

function eliminarFilaServicio(boton) {
    boton.closest('tr').remove();
    recalcularTotales();
}

function actualizarPrecio(sel) {
    const tr = sel.closest("tr");
    tr.querySelector(".precio").value = preciosServicios[sel.value];
    calcularFila(tr.querySelector(".precio"));
}

function calcularFila(el) {
    const tr = el.closest("tr");
    const p = parseFloat(tr.querySelector(".precio").value) || 0;
    const c = parseFloat(tr.querySelector(".cant").value) || 0;
    const d = parseFloat(tr.querySelector(".desc").value) || 0;
    tr.querySelector(".totalFila").value = ((p - d) * c).toFixed(2);
    recalcularTotales();
}

function recalcularTotales() {
    let sub = 0, dTotal = 0;
    document.querySelectorAll("#serviciosBody tr").forEach(tr => {
        const p = parseFloat(tr.querySelector(".precio").value) || 0;
        const c = parseFloat(tr.querySelector(".cant").value) || 0;
        const d = parseFloat(tr.querySelector(".desc").value) || 0;
        sub += (p * c);
        dTotal += (d * c);
    });
    document.getElementById("subtotal").value = sub.toFixed(2);
    document.getElementById("descuentos").value = "-" + dTotal.toFixed(2);
    document.getElementById("totalFinal").value = (sub - dTotal).toFixed(2);
}

/* --- ALERTAS BOOTSTRAP --- */
function mostrarAlerta(msj, tipo = 'success') {
    const modalEl = document.getElementById('alertaModal');
    const content = document.getElementById('modalContentAlerta');
    
    document.getElementById('modalTitulo').innerText = tipo === 'success' ? 'Éxito' : 'Atención';
    document.getElementById('modalIcono').innerText = tipo === 'success' ? '✅' : '⚠️';
    document.getElementById('modalMensaje').innerText = msj;
    
    content.className = `modal-content text-center p-4 border-top border-5 ${tipo === 'success' ? 'border-success' : 'border-warning'}`;
    
    let inst = new bootstrap.Modal(modalEl);
    inst.show();
    if(tipo === 'success') setTimeout(() => inst.hide(), 2000);
}

/* --- PDF CON VALIDACIÓN --- */
function generarFactura() {
    const num = document.getElementById("numeroFactura").value;
    const cliSelect = document.getElementById("clienteSelect");
    const cliente = cliSelect.options[cliSelect.selectedIndex]?.text || "";
    const filas = document.querySelectorAll("#serviciosBody tr");

    // 1. VALIDACIÓN: Cliente seleccionado
    if (!cliente || cliente.includes("INDICAR CLIENTE")) {
        return mostrarAlerta("Debe seleccionar un cliente válido de la lista.", "error");
    }

    // 2. VALIDACIÓN: Al menos un servicio
    if (filas.length === 0) {
        return mostrarAlerta("La factura no tiene servicios cargados.", "error");
    }

    // 3. VALIDACIÓN: Todos los meses cargados
    let mesesCompletos = true;
    filas.forEach(tr => {
        if (!tr.querySelector(".mes").value) mesesCompletos = false;
    });

    if (!mesesCompletos) {
        return mostrarAlerta("Por favor, indique el mes para todos los servicios.", "error");
    }

    // SI PASA LAS VALIDACIONES, GENERA EL PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString();

    doc.setFontSize(20); doc.text("HASHRATE SPACE", 105, 20, {align: "center"});
    doc.setFontSize(10); doc.text(`Comprobante: ${num} | Fecha: ${fecha}`, 20, 35);
    doc.text(`Cliente: ${cliente}`, 20, 42);

    let y = 60;
    doc.setFont(undefined, 'bold'); doc.text("Detalle", 20, 55); doc.text("Total", 170, 55);
    doc.setFont(undefined, 'normal');
    
    filas.forEach(tr => {
        const serv = tr.querySelector(".servicioSelect option:checked").text;
        const tot = tr.querySelector(".totalFila").value;
        doc.text(serv, 20, y); doc.text(`$ ${tot}`, 170, y);
        y += 8;
    });

    doc.line(20, y, 190, y);
    doc.setFontSize(14); doc.text(`TOTAL FINAL: $ ${document.getElementById("totalFinal").value}`, 190, y + 12, {align: "right"});
    
    doc.save(`${num}_${cliente}.pdf`);

    // GUARDAR EN HISTORIAL
    let hist = JSON.parse(localStorage.getItem("facturas_hrs")) || [];
    hist.push({
        numero: num,
        cliente: cliente,
        fecha: fecha,
        mes: filas[0].querySelector(".mes").value,
        total: document.getElementById("totalFinal").value
    });
    localStorage.setItem("facturas_hrs", JSON.stringify(hist));
    
    actualizarTablaHistorial();
    generarNumeroFactura();
    mostrarAlerta("Comprobante generado y guardado correctamente.");
}

/* --- RESTO DE FUNCIONES (EXCEL E HISTORIAL) --- */
function exportarExcel() {
    let hist = JSON.parse(localStorage.getItem("facturas_hrs")) || [];
    if (hist.length === 0) return mostrarAlerta("No hay historial para exportar.", "error");
    const ws = XLSX.utils.json_to_sheet(hist);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial");
    XLSX.writeFile(wb, "HRS_Historial.xlsx");
}

function actualizarTablaHistorial() {
    const tbody = document.getElementById("facturasBody");
    if (!tbody) return;
    const hist = JSON.parse(localStorage.getItem("facturas_hrs")) || [];
    tbody.innerHTML = "";
    hist.slice().reverse().forEach((f, i) => {
        const realIdx = hist.length - 1 - i;
        tbody.innerHTML += `
            <tr>
                <td>${f.numero}</td><td>${f.cliente}</td><td>${f.fecha}</td>
                <td class="text-uppercase">${f.mes}</td><td class="fw-bold">$ ${f.total}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="eliminarFilaHistorial(${realIdx})">🗑️</button>
                </td>
            </tr>`;
    });
}

function eliminarFilaHistorial(idx) {
    indiceAEliminar = idx;
    new bootstrap.Modal(document.getElementById('confirmarEliminarModal1')).show();
}

function abrirSegundoChequeo() {
    bootstrap.Modal.getInstance(document.getElementById('confirmarEliminarModal1')).hide();
    setTimeout(() => { new bootstrap.Modal(document.getElementById('confirmarEliminarModal2')).show(); }, 400);
}

function ejecutarEliminacionDefinitiva() {
    let hist = JSON.parse(localStorage.getItem("facturas_hrs")) || [];
    hist.splice(indiceAEliminar, 1);
    localStorage.setItem("facturas_hrs", JSON.stringify(hist));
    bootstrap.Modal.getInstance(document.getElementById('confirmarEliminarModal2')).hide();
    actualizarTablaHistorial();
    generarNumeroFactura();
    mostrarAlerta("Registro borrado.", "error");
}
