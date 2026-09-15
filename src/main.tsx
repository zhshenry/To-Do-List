import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AssistantApp } from './AssistantApp';
import './styles.css';
const assistant = new URLSearchParams(window.location.search).get('window') === 'assistant';
document.title = assistant ? 'AI 助手 | To Do List' : 'To Do List';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{assistant ? <AssistantApp /> : <App />}</React.StrictMode>);
