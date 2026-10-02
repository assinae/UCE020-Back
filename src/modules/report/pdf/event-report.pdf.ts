import * as React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import { streamToBuffer } from 'src/modules/certificate/pdf/stream-to-buffer';

type AttendanceRow = {
  participantName: string;
  email: string;
  role: string;
  present: boolean;
  checkedInAt: string | null;
  confirmedBy: string | null;
};

export type ActivityAttendanceSection = {
  name: string;
  location: string;
  period: string;
  rows: AttendanceRow[];
  history: AuditRow[];
};

export type AuditRow = {
  participantName: string;
  action: string;
  author: string;
  timestamp: string;
};

export type MonitorRow = {
  name: string;
  email: string;
  role: string;
  activityName: string;
  firstCheckin: string;
  lastCheckin: string;
  totalCheckins: number;
};

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Helvetica', fontSize: 8, color: '#172033' },
  title: { fontSize: 17, fontWeight: 700, marginBottom: 4, color: '#0f1d35' },
  subtitle: { fontSize: 9, color: '#52606d', marginBottom: 14 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#0f1d35',
    marginBottom: 3,
  },
  meta: { color: '#52606d', marginBottom: 6 },
  table: { borderWidth: 1, borderColor: '#d8dee8' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e6eaf0',
    minHeight: 20,
  },
  header: { backgroundColor: '#0f1d35', color: '#ffffff', fontWeight: 700 },
  cell: { padding: 4, justifyContent: 'center' },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 30,
    right: 30,
    fontSize: 7,
    color: '#6b7280',
    textAlign: 'center',
  },
});

const attendanceColumns = [
  ['Participante', '28%'],
  ['E-mail', '27%'],
  ['Papel', '11%'],
  ['Situação', '11%'],
  ['Check-in', '12%'],
  ['Confirmado por', '11%'],
] as const;

const monitorColumns = [
  ['Responsável', '22%'],
  ['Atividade', '25%'],
  ['Primeiro check-in', '17%'],
  ['Último check-in', '17%'],
  ['Total', '9%'],
  ['Papel', '10%'],
] as const;

const auditColumns = [
  ['Participante', '35%'],
  ['Ação', '20%'],
  ['Autor', '25%'],
  ['Data e hora', '20%'],
] as const;

function Table({
  columns,
  children,
}: {
  columns: readonly (readonly [string, string])[];
  children?: React.ReactNode;
}) {
  return React.createElement(
    View,
    { style: styles.table },
    React.createElement(
      View,
      { style: [styles.row, styles.header], fixed: true },
      ...columns.map(([label, width]) =>
        React.createElement(
          Text,
          { key: label, style: [styles.cell, { width }] },
          label,
        ),
      ),
    ),
    children,
  );
}

function Footer({ generatedAt }: { generatedAt: string }) {
  return React.createElement(Text, {
    style: styles.footer,
    fixed: true,
    render: ({ pageNumber, totalPages }) =>
      `Relatório gerado em ${generatedAt} · Página ${pageNumber}/${totalPages}`,
  });
}

function formatConfirmationAuthor(name: string): string {
  if (name === 'Indisponível' || name === '—') return name;

  const [firstName, ...remainingNames] = name.trim().split(/\s+/);
  if (!firstName || remainingNames.length === 0) return name;

  return `${firstName}\n${remainingNames.map((part) => `${part[0]}.`).join(' ')}`;
}

export async function renderAttendanceReportPdf(data: {
  title: string;
  eventName: string;
  eventPeriod: string;
  generatedAt: string;
  sections: ActivityAttendanceSection[];
  isSimpleEvent: boolean;
}): Promise<Buffer> {
  const document = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, data.title),
      React.createElement(
        Text,
        { style: styles.subtitle },
        `${data.eventName} · ${data.eventPeriod}`,
      ),
      ...data.sections.map((section) =>
        React.createElement(
          View,
          { key: section.name, style: styles.section, wrap: true },
          React.createElement(
            Text,
            { style: styles.sectionTitle },
            section.name,
          ),
          React.createElement(
            Text,
            { style: styles.meta },
            `${section.location} · ${section.period} · ${section.rows.filter((row) => row.present).length}/${section.rows.length} presença(s) confirmada(s)`,
          ),
          React.createElement(
            Table,
            { columns: attendanceColumns },
            ...section.rows.map((row, index) =>
              React.createElement(
                View,
                {
                  key: `${row.email}-${index}`,
                  style: styles.row,
                  wrap: false,
                },
                React.createElement(
                  Text,
                  { style: [styles.cell, { width: '28%' }] },
                  row.participantName,
                ),
                React.createElement(
                  Text,
                  { style: [styles.cell, { width: '27%' }] },
                  row.email,
                ),
                React.createElement(
                  Text,
                  { style: [styles.cell, { width: '11%' }] },
                  row.role,
                ),
                React.createElement(
                  Text,
                  { style: [styles.cell, { width: '11%' }] },
                  row.present
                    ? 'Presente'
                    : data.isSimpleEvent
                      ? 'Inscrito'
                      : 'Ausente',
                ),
                React.createElement(
                  Text,
                  { style: [styles.cell, { width: '12%' }] },
                  row.checkedInAt ?? '—',
                ),
                React.createElement(
                  Text,
                  { style: [styles.cell, { width: '11%' }] },
                  formatConfirmationAuthor(row.confirmedBy ?? '—'),
                ),
              ),
            ),
          ),
          section.history.length > 0
            ? React.createElement(
                View,
                { style: { marginTop: 7 } },
                React.createElement(
                  Text,
                  { style: styles.meta },
                  'Histórico de alterações',
                ),
                React.createElement(
                  Table,
                  { columns: auditColumns },
                  ...section.history.map((entry, index) =>
                    React.createElement(
                      View,
                      {
                        key: `${entry.participantName}-${entry.timestamp}-${index}`,
                        style: styles.row,
                        wrap: false,
                      },
                      React.createElement(
                        Text,
                        { style: [styles.cell, { width: '35%' }] },
                        entry.participantName,
                      ),
                      React.createElement(
                        Text,
                        { style: [styles.cell, { width: '20%' }] },
                        entry.action,
                      ),
                      React.createElement(
                        Text,
                        { style: [styles.cell, { width: '25%' }] },
                        entry.author,
                      ),
                      React.createElement(
                        Text,
                        { style: [styles.cell, { width: '20%' }] },
                        entry.timestamp,
                      ),
                    ),
                  ),
                ),
              )
            : null,
        ),
      ),
      React.createElement(Footer, { generatedAt: data.generatedAt }),
    ),
  );
  return streamToBuffer(await pdf(document).toBuffer());
}

export async function renderMonitorReportPdf(data: {
  eventName: string;
  eventPeriod: string;
  generatedAt: string;
  rows: MonitorRow[];
}): Promise<Buffer> {
  const document = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        Text,
        { style: styles.title },
        'Relatório de Check-ins',
      ),
      React.createElement(
        Text,
        { style: styles.subtitle },
        `${data.eventName} · ${data.eventPeriod}`,
      ),
      React.createElement(
        Table,
        { columns: monitorColumns },
        ...data.rows.map((row, index) =>
          React.createElement(
            View,
            {
              key: `${row.email}-${row.activityName}-${index}`,
              style: styles.row,
              wrap: false,
            },
            React.createElement(
              Text,
              { style: [styles.cell, { width: '22%' }] },
              `${row.name}\n${row.email}`,
            ),
            React.createElement(
              Text,
              { style: [styles.cell, { width: '25%' }] },
              row.activityName,
            ),
            React.createElement(
              Text,
              { style: [styles.cell, { width: '17%' }] },
              row.firstCheckin,
            ),
            React.createElement(
              Text,
              { style: [styles.cell, { width: '17%' }] },
              row.lastCheckin,
            ),
            React.createElement(
              Text,
              { style: [styles.cell, { width: '9%' }] },
              String(row.totalCheckins),
            ),
            React.createElement(
              Text,
              { style: [styles.cell, { width: '10%' }] },
              row.role,
            ),
          ),
        ),
      ),
      React.createElement(Footer, { generatedAt: data.generatedAt }),
    ),
  );
  return streamToBuffer(await pdf(document).toBuffer());
}
