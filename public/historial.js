/* ============================================================
   LÓGICA DE HISTORIAL DE FACTURAS - HRS
   ============================================================ */

let facturasOriginales = [];

window.onload = () => {
    cargarHistorial();
    actualizarEstadisticas();
};

/* --- CARGAR Y MOSTRAR HISTORIAL --- */
function cargarHistorial() {
    facturasOriginales = JSON.parse(localStorage.getItem("facturas_hrs")) || [];
    mostrarFacturasEnTabla(facturasOriginales);
}

function mostrarFacturasEnTabla(facturas) {
    const tbody = document.getElementById("facturasHistorialBody");
    
    if (facturas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><small>No hay facturas registradas</small></td></tr>';
        return;
    }

    tbody.innerHTML = facturas.map((factura, index) => {
        const tipo = factura.numero.startsWith("FC-") ? "Factura" : "Recibo";
        const badgeClass = tipo === "Factura" ? "badge-factura" : "badge-recibo";
        const fechaObj = new Date(factura.fecha);
        const fechaFormato = fechaObj.toLocaleDateString('es-ES');
        const mesFormato = factura.mes || fechaObj.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit' });
        
        return `
            <tr>
                <td class="fw-bold">${factura.numero}</td>
                <td><span class="${badgeClass}">${tipo}</span></td>
                <td>${factura.cliente}</td>
                <td>${fechaFormato}</td>
                <td>${mesFormato}</td>
                <td class="fw-bold">$ ${parseFloat(factura.total).toFixed(2)}</td>
                <td class="text-center">
                    <button class="btn btn-info btn-action btn-sm" onclick="descargarFactura(${index})" title="Descargar PDF">
                        📥
                    </button>
                    <button class="btn btn-warning btn-action btn-sm" onclick="verDetalles(${index})" title="Ver detalles">
                        👁️
                    </button>
                    <button class="btn btn-danger btn-action btn-sm" onclick="eliminarFactura(${index})" title="Eliminar">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    actualizarEstadisticas();
}

/* --- FILTROS --- */
function aplicarFiltros() {
    const cliente = document.getElementById("filtroCliente").value.toLowerCase();
    const tipo = document.getElementById("filtroTipo").value;
    const mes = document.getElementById("filtroMes").value;

    let facturasFiltradas = facturasOriginales.filter(factura => {
        const cumpleCliente = factura.cliente.toLowerCase().includes(cliente);
        const cumpleTipo = !tipo || (tipo === "Factura" && factura.numero.startsWith("FC-")) || (tipo === "Recibo" && factura.numero.startsWith("RC-"));
        const cumpleMes = !mes || factura.mes?.startsWith(mes);
        
        return cumpleCliente && cumpleTipo && cumpleMes;
    });

    mostrarFacturasEnTabla(facturasFiltradas);
}

function limpiarFiltros() {
    document.getElementById("filtroCliente").value = "";
    document.getElementById("filtroTipo").value = "";
    document.getElementById("filtroMes").value = "";
    mostrarFacturasEnTabla(facturasOriginales);
}

/* --- ACCIONES SOBRE FACTURAS --- */
function descargarFactura(index) {
    const factura = facturasOriginales[index];
    // Aquí iría la lógica para regenerar el PDF usando jsPDF
    // Por ahora mostramos un mensaje
    mostrarAlerta("📥", "Descargando...", `Se está descargando ${factura.numero}`);
}

function verDetalles(index) {
    const factura = facturasOriginales[index];
    let servicios = "";
    
    if (factura.servicios && factura.servicios.length > 0) {
        servicios = factura.servicios.map((s, i) => 
            `${i + 1}. ${s.concepto}: $ ${s.monto.toFixed(2)}`
        ).join("<br>");
    } else {
        servicios = "Sin servicios registrados";
    }

    const tipo = factura.numero.startsWith("FC-") ? "FACTURA" : "RECIBO";
    let detalles = `
        <strong>${tipo} #${factura.numero}</strong><br>
        <strong>Cliente:</strong> ${factura.cliente}<br>
        <strong>Fecha:</strong> ${factura.fecha}<br>
        <strong>Mes:</strong> ${factura.mes || "N/A"}<br>
        <hr>
        <strong>Servicios:</strong><br>
        ${servicios}<br>
        <hr>
        <strong>Total:</strong> $ ${parseFloat(factura.total).toFixed(2)}
    `;

    mostrarAlerta("👁️", "Detalles de " + tipo, detalles);
}

function eliminarFactura(index) {
    const factura = facturasOriginales[index];
    if (confirm(`¿Está seguro que desea eliminar ${factura.numero}?`)) {
        facturasOriginales.splice(index, 1);
        localStorage.setItem("facturas_hrs", JSON.stringify(facturasOriginales));
        mostrarHistorial();
        mostrarAlerta("✅", "Eliminado", `${factura.numero} ha sido eliminado del historial`);
    }
}

/* --- EXPORTAR A EXCEL --- */
function exportarHistorialExcel() {
    if (facturasOriginales.length === 0) {
        mostrarAlerta("⚠️", "Sin datos", "No hay facturas para exportar");
        return;
    }

    const datos = facturasOriginales.map(f => ({
        "Número": f.numero,
        "Tipo": f.numero.startsWith("FC-") ? "Factura" : "Recibo",
        "Cliente": f.cliente,
        "Fecha": f.fecha,
        "Mes": f.mes || "",
        "Total": parseFloat(f.total).toFixed(2)
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    ws['!cols'] = [
        { wch: 12 },
        { wch: 10 },
        { wch: 25 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial");
    
    const nombreArchivo = `Historial_Facturas_${new Date().toLocaleDateString('es-ES')}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);

    mostrarAlerta("✅", "Exportado", `Archivo "${nombreArchivo}" descargado`);
}

/* --- BORRAR TODO --- */
function abrirConfirmacionBorrar() {
    const modal = new bootstrap.Modal(document.getElementById("confirmarBorrarModal"));
    modal.show();
}

function confirmarBorrarHistorial() {
    facturasOriginales = [];
    localStorage.setItem("facturas_hrs", JSON.stringify(facturasOriginales));
    bootstrap.Modal.getInstance(document.getElementById("confirmarBorrarModal")).hide();
    mostrarHistorial();
    mostrarAlerta("✅", "Historial limpiado", "Se ha eliminado todo el historial de facturas");
}

/* --- ACTUALIZAR ESTADÍSTICAS --- */
function actualizarEstadisticas() {
    const facturas = facturasOriginales.filter(f => f.numero.startsWith("FC-"));
    const recibos = facturasOriginales.filter(f => f.numero.startsWith("RC-"));
    const montoTotal = facturasOriginales.reduce((sum, f) => sum + parseFloat(f.total || 0), 0);

    document.getElementById("statsFacturas").textContent = facturas.length;
    document.getElementById("statsRecibos").textContent = recibos.length;
    document.getElementById("statsMontoTotal").textContent = `$ ${montoTotal.toFixed(2)}`;
    document.getElementById("statsTotal").textContent = facturasOriginales.length;
}

function mostrarHistorial() {
    cargarHistorial();
}

/* --- MODAL DE ALERTA --- */
function mostrarAlerta(icono, titulo, mensaje) {
    document.getElementById("modalIcono").textContent = icono;
    document.getElementById("modalTitulo").textContent = titulo;
    document.getElementById("modalMensaje").innerHTML = mensaje;
    
    const modal = new bootstrap.Modal(document.getElementById("alertaModal"));
    modal.show();
}
