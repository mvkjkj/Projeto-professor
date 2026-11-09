const form = document.getElementById("form-atividade");
const listaAtividades = document.getElementById("lista-atividades");
const buscaAluno = document.getElementById("busca-aluno");
const filtroStatus = document.getElementById("filtro-status");

const qtdTotal = document.getElementById("qtd-total");
const qtdFeitas = document.getElementById("qtd-feitas");
const qtdPendentes = document.getElementById("qtd-pendentes");
const qtdNaoFeitas = document.getElementById("qtd-nao-feitas");

const token = localStorage.getItem("token");

if (!token) {
    alert("Faça login primeiro.");
    window.location.href = "login.html";
}

let dadosAtividades = [];

// ==========================
// CARREGAR ATIVIDADES
// ==========================

async function carregarAtividades() {

    try {

        const resposta = await fetch(
            "http://localhost:3000/atividades",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!resposta.ok) {
            throw new Error("Erro ao buscar atividades");
        }

        dadosAtividades = await resposta.json();

        renderizarTabela();

    } catch (erro) {

        console.error(
            "Erro ao carregar atividades:",
            erro
        );

    }

}

// ==========================
// CONTADORES
// ==========================

function atualizarContadores() {

    const total = dadosAtividades.length;

    const feitas =
        dadosAtividades.filter(
            item => item.status === "Feita"
        ).length;

    const pendentes =
        dadosAtividades.filter(
            item => item.status === "Pendente"
        ).length;

    const naoFeitas =
        dadosAtividades.filter(
            item => item.status === "Não Feita"
        ).length;

    qtdTotal.innerText = total;
    qtdFeitas.innerText = feitas;
    qtdPendentes.innerText = pendentes;
    qtdNaoFeitas.innerText = naoFeitas;

}

// ==========================
// TABELA
// ==========================

function renderizarTabela() {

    listaAtividades.innerHTML = "";

    const termoBusca =
        buscaAluno.value.toLowerCase();

    const statusSelecionado =
        filtroStatus.value;

    dadosAtividades.forEach((item) => {

        const bateuNome =
            item.aluno
                .toLowerCase()
                .includes(termoBusca);

        const bateuStatus =
            statusSelecionado === "Todos" ||
            item.status === statusSelecionado;

        if (bateuNome && bateuStatus) {

            const tr =
                document.createElement("tr");

            tr.innerHTML = `
                <td>${item.aluno}</td>
                <td>${item.atividade}</td>
                <td>${item.status}</td>
                <td>
                    <button onclick="excluirAtividade(${item.id})">
                        Excluir
                    </button>
                </td>
            `;

            listaAtividades.appendChild(tr);

        }

    });

    atualizarContadores();

}

// ==========================
// FILTROS
// ==========================

buscaAluno.addEventListener(
    "input",
    renderizarTabela
);

filtroStatus.addEventListener(
    "change",
    renderizarTabela
);

// ==========================
// NOVA ATIVIDADE
// ==========================

form.addEventListener(
    "submit",
    async (e) => {

        e.preventDefault();

        const aluno =
            document.getElementById("aluno").value;

        const atividade =
            document.getElementById("atividade").value;

        const status =
            document.getElementById("status").value;

        try {

            const resposta = await fetch(
                "http://localhost:3000/atividades",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        aluno,
                        atividade,
                        status
                    })
                }
            );

            const dados =
                await resposta.json();

            if (resposta.ok) {

                alert(
                    "Atividade cadastrada com sucesso!"
                );

                form.reset();

                carregarAtividades();

            } else {

                alert(
                    dados.erro
                );

            }

        } catch (erro) {

            console.error(erro);

            alert(
                "Erro ao conectar ao servidor."
            );

        }

    }
);

// ==========================
// EXCLUIR
// ==========================

async function excluirAtividade(id) {

    const confirmar = confirm(
        "Deseja realmente excluir esta atividade?"
    );

    if (!confirmar) {
        return;
    }

    try {

        const resposta = await fetch(
            `http://localhost:3000/atividades/${id}`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const dados =
            await resposta.json();

        if (resposta.ok) {

            alert(
                dados.mensagem
            );

            carregarAtividades();

        } else {

            alert(
                dados.erro
            );

        }

    } catch (erro) {

        console.error(erro);

        alert(
            "Erro ao excluir atividade."
        );

    }

}

// ==========================
// INICIAR
// ==========================

carregarAtividades();