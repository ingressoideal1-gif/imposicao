-- Script para criar as tabelas do Ideal Imposition no Supabase

-- Tabela: formatos
create table if not exists formatos (
    id text primary key,
    name text not null,
    width_mm numeric not null,
    height_mm numeric not null,
    cols integer not null default 1,
    rows integer not null default 1,
    gap_h_mm numeric default 0,
    gap_v_mm numeric default 0,
    offset_h_mm numeric default 0,
    offset_v_mm numeric default 0,
    rotations jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table formatos disable row level security;

-- Tabela: saidas
create table if not exists saidas (
    id text primary key,
    name text not null,
    width_mm numeric not null,
    height_mm numeric not null,
    file_format text default 'pdf',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table saidas disable row level security;

-- Tabela: cores
create table if not exists cores (
    id text primary key,
    name text not null,
    formato_id text,
    width_mm numeric,
    height_mm numeric,
    pdf_base64 text,
    pdf_filename text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table cores disable row level security;

-- Tabela: numeracoes
create table if not exists numeracoes (
    id text primary key,
    name text not null,
    formato_id text,
    formato_ids jsonb,
    csv_filename text,
    csv_headers jsonb,
    csv_data jsonb,
    svg_content text,
    svg_filename text,
    pdf_content text,
    pdf_filename text,
    elements jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table numeracoes disable row level security;

-- Tabela: modelos_imposicao
create table if not exists modelos_imposicao (
    id text primary key,
    name text not null,
    config jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table modelos_imposicao disable row level security;
